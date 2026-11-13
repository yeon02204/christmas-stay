/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api.js'
import { removePhotos } from '../services/photos.js'
import { EMPTY_RATINGS } from '../utils/models.js'
import { rangeKey } from '../utils/date.js'

const StoreContext = createContext(null)

function transformState(raw) {
  const ratingsByUser = {}
  for (const r of raw.ratings || []) {
    ratingsByUser[r.userId] ??= {}
    ratingsByUser[r.userId][r.roomId] = {
      price: r.price, location: r.location, facility: r.facility, mood: r.mood, terms: r.terms,
    }
  }
  const extraOwner = {}
  for (const room of raw.rooms || []) for (const e of room.extras) extraOwner[e.id] = room.id
  const custom = {}
  for (const id of raw.compareOptions?.extraIds || []) {
    const roomId = extraOwner[id]
    if (roomId) (custom[roomId] ??= {})[id] = true
  }
  return {
    me: raw.me,
    members: raw.members || [],
    trip: { checkIn: raw.trip.checkIn, checkOut: raw.trip.checkOut },
    tripUpdatedBy: raw.trip.updatedBy,
    // 유형 컬럼 마이그레이션 전 DB 에서도 깨지지 않도록 기본값 '' (미분류)
    stays: (raw.stays || []).map((s) => ({ ...s, stayType: s.stayType ?? '' })),
    rooms: raw.rooms || [],
    favorites: raw.favorites || [],
    ratingsByUser,
    compare: raw.compare || [],
    compareOptions: { bbq: !!raw.compareOptions?.bbq, fire: !!raw.compareOptions?.fire, custom },
  }
}

const customToExtraIds = (custom) =>
  Object.values(custom).flatMap((sel) => Object.keys(sel).filter((k) => sel[k]))

export function AppStoreProvider({ children, onAuthError }) {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const stateRef = useRef(null)
  const loadedAt = useRef(0)
  stateRef.current = state

  const apply = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      stateRef.current = next
      return next
    })
  }, [])

  const handleError = useCallback(
    (err) => {
      if (err?.kind === 'auth') onAuthError?.()
      throw err
    },
    [onAuthError],
  )

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setStatus((s) => (s === 'ready' ? s : 'loading'))
      try {
        const raw = await api.getState()
        apply(transformState(raw))
        loadedAt.current = Date.now()
        setStatus('ready')
        setError(null)
      } catch (err) {
        if (err?.kind === 'auth') onAuthError?.()
        if (!silent || !stateRef.current) {
          setError(err)
          setStatus('error')
        }
        if (silent) throw err
      }
    },
    [apply, onAuthError],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  // 다른 기기에서 바뀐 내용을 반영: 창으로 돌아올 때 다시 불러온다 (실시간 동기화는 아님)
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > 10000) {
        refresh({ silent: true }).catch(() => {})
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  /** 낙관적 업데이트: 화면 먼저 바꾸고, 실패하면 해당 키를 되돌린다 */
  const optimistic = useCallback(
    async (keys, updater, call) => {
      const prev = stateRef.current
      const backup = Object.fromEntries(keys.map((k) => [k, prev[k]]))
      apply((s) => ({ ...s, ...updater(s) }))
      try {
        return await call()
      } catch (err) {
        apply((s) => ({ ...s, ...backup }))
        return handleError(err)
      }
    },
    [apply, handleError],
  )

  const actions = useMemo(
    () => ({
      refresh,

      // ── 숙소 ──
      async saveStay(stay) {
        const res = await api.saveStay(stay).catch(handleError)
        removePhotos(res.removedPaths)
        const saved = { ...res.stay, stayType: res.stay.stayType ?? '' }
        apply((s) => {
          const exists = s.stays.some((x) => x.id === saved.id)
          return {
            ...s,
            stays: exists ? s.stays.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...s.stays],
          }
        })
        return saved
      },
      getDeleteImpact: (stayId) => api.stayDeleteImpact(stayId).catch(handleError),
      async deleteStay(stayId) {
        const res = await api.deleteStay(stayId).catch(handleError)
        removePhotos(res.removedPaths)
        await refresh({ silent: true }).catch(() => {})
      },

      // ── 객실 ──
      async saveRoom(room) {
        const res = await api.saveRoom(room).catch(handleError)
        removePhotos(res.removedPaths)
        apply((s) => {
          const exists = s.rooms.some((x) => x.id === res.room.id)
          return {
            ...s,
            rooms: exists ? s.rooms.map((x) => (x.id === res.room.id ? res.room : x)) : [...s.rooms, res.room],
          }
        })
        return res.room
      },
      async deleteRoom(roomId) {
        const res = await api.deleteRoom(roomId).catch(handleError)
        removePhotos(res.removedPaths)
        await refresh({ silent: true }).catch(() => {})
      },
      updateRoomNotes: (roomId, pros, cons) =>
        optimistic(
          ['rooms'],
          (s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, pros, cons } : r)) }),
          () => api.updateRoomNotes(roomId, pros, cons),
        ),

      // ── 찜 (내 것) ──
      toggleFavorite(roomId) {
        const on = !stateRef.current.favorites.some((f) => f.roomId === roomId)
        return optimistic(
          ['favorites'],
          (s) => ({
            favorites: on
              ? [...s.favorites, { roomId, memo: '', addedAt: new Date().toISOString() }]
              : s.favorites.filter((f) => f.roomId !== roomId),
          }),
          () => api.setFavorite(roomId, on),
        ).then(() => on)
      },
      updateFavoriteMemo: (roomId, memo) =>
        optimistic(
          ['favorites'],
          (s) => ({ favorites: s.favorites.map((f) => (f.roomId === roomId ? { ...f, memo } : f)) }),
          () => api.updateFavoriteMemo(roomId, memo),
        ),
      moveFavorite(roomId, dir) {
        const list = [...stateRef.current.favorites]
        const i = list.findIndex((f) => f.roomId === roomId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= list.length) return Promise.resolve()
        ;[list[i], list[j]] = [list[j], list[i]]
        return optimistic(['favorites'], () => ({ favorites: list }), () =>
          api.reorderFavorites(list.map((f) => f.roomId)),
        )
      },

      // ── 평가 (내 것) ──
      setRating(roomId, criterion, score) {
        const myId = stateRef.current.me.id
        return optimistic(
          ['ratingsByUser'],
          (s) => {
            const mine = { ...(s.ratingsByUser[myId] || {}) }
            mine[roomId] = { ...EMPTY_RATINGS, ...mine[roomId], [criterion]: score }
            return { ratingsByUser: { ...s.ratingsByUser, [myId]: mine } }
          },
          () => api.setRating(roomId, criterion, score),
        )
      },

      // ── 비교 (내 것) ──
      setCompareList(ids) {
        const list = [...new Set(ids)].slice(0, 3)
        return optimistic(['compare'], () => ({ compare: list }), () => api.setCompare(list))
      },
      toggleCompare(roomId) {
        const cur = stateRef.current.compare
        if (cur.includes(roomId)) {
          return actions.setCompareList(cur.filter((id) => id !== roomId)).then(() => ({ added: false }))
        }
        if (cur.length >= 3) return Promise.resolve({ full: true })
        return actions.setCompareList([...cur, roomId]).then(() => ({ added: true }))
      },
      setCompareOptions(patch) {
        const next = { ...stateRef.current.compareOptions, ...patch }
        return optimistic(['compareOptions'], () => ({ compareOptions: next }), () =>
          api.setCompareOptions(next.bbq, next.fire, customToExtraIds(next.custom)),
        )
      },
      toggleCustomExtra(roomId, extraId) {
        const cur = stateRef.current.compareOptions.custom
        const sel = { ...(cur[roomId] || {}) }
        if (sel[extraId]) delete sel[extraId]
        else sel[extraId] = true
        return actions.setCompareOptions({ custom: { ...cur, [roomId]: sel } })
      },

      // ── 공동 일정 ──
      setTrip: (trip) =>
        optimistic(['trip'], () => ({ trip }), () => api.setTrip(trip.checkIn, trip.checkOut)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, handleError, optimistic, refresh],
  )

  const value = useMemo(() => ({ state, status, error, actions }), [state, status, error, actions])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider')
  return ctx
}

/** 자주 쓰는 파생 데이터 */
export function useDerived() {
  const { state } = useStore()
  return useMemo(() => {
    const key = rangeKey(state.trip)
    const staysById = Object.fromEntries(state.stays.map((s) => [s.id, s]))
    const roomsById = Object.fromEntries(state.rooms.map((r) => [r.id, r]))
    const roomsByStay = {}
    state.rooms.forEach((r) => (roomsByStay[r.stayId] ??= []).push(r))
    const favoriteIds = new Set(state.favorites.map((f) => f.roomId))
    const partner = state.members.find((m) => m.id !== state.me.id) || null
    const myRatings = state.ratingsByUser[state.me.id] || {}
    const partnerRatings = partner ? state.ratingsByUser[partner.id] || {} : {}
    return { key, staysById, roomsById, roomsByStay, favoriteIds, partner, myRatings, partnerRatings }
  }, [state])
}
