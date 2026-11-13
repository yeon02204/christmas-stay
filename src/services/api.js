// 데이터 접근 계층. 컴포넌트는 supabase 클라이언트를 직접 쓰지 않고 store 를 통해 이 모듈만 사용한다.
// 모든 쓰기는 DB 함수(RPC)로 처리해 여러 테이블 저장을 하나의 트랜잭션으로 묶고, RLS 가 그대로 적용된다.

import { supabase } from './supabaseClient.js'

export class ApiError extends Error {
  constructor(kind, message, cause) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind // 'conflict' | 'notFound' | 'forbidden' | 'invalid' | 'network' | 'auth' | 'unknown'
    this.cause = cause
  }
}

function toApiError(error) {
  if (!error) return null
  const code = error.code || ''
  const msg = String(error.message || '')
  const detail = msg.replace(/^[A-Z_]+:\s*/, '')
  if (code === 'P0409') return new ApiError('conflict', '다른 사람이 먼저 수정했어.', error)
  if (code === 'P0404') return new ApiError('notFound', `${detail} 이미 삭제됐을 수 있어.`, error)
  if (code === '42501') return new ApiError('forbidden', '이 계정은 멤버로 등록되지 않아 접근할 수 없어.', error)
  if (code === '22023') return new ApiError('invalid', detail, error)
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22007' || code === '22008')
    return new ApiError('invalid', '입력값이 허용 범위를 벗어났어. 금액·날짜·URL을 확인해 줘.', error)
  if (code === '23505') return new ApiError('invalid', '중복된 항목이 있어. (바비큐·불멍은 객실당 하나만)', error)
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(msg))
    return new ApiError('auth', '로그인이 만료됐어. 다시 로그인해 줘.', error)
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg))
    return new ApiError(
      'network',
      '서버에 연결할 수 없어. 인터넷 연결을 확인해 줘. (Supabase 무료 프로젝트는 7일 동안 사용하지 않으면 일시정지돼)',
      error,
    )
  return new ApiError('unknown', detail || '알 수 없는 오류가 발생했어.', error)
}

async function rpc(fn, args) {
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (err) {
    throw toApiError({ message: err?.message || 'Failed to fetch' })
  }
  if (res.error) throw toApiError(res.error)
  return res.data
}

export const api = {
  getState: () => rpc('get_app_state'),

  saveStay: (stay) => rpc('save_stay', { p: stay }),
  stayDeleteImpact: (stayId) => rpc('stay_delete_impact', { p_stay_id: stayId }),
  deleteStay: (stayId) => rpc('delete_stay', { p_stay_id: stayId }),

  saveRoom: (room) => rpc('save_room', { p: room }),
  deleteRoom: (roomId) => rpc('delete_room', { p_room_id: roomId }),
  updateRoomNotes: (roomId, pros, cons) => rpc('update_room_notes', { p_room_id: roomId, p_pros: pros, p_cons: cons }),

  setFavorite: (roomId, on) => rpc('set_favorite', { p_room_id: roomId, p_on: on }),
  updateFavoriteMemo: (roomId, memo) => rpc('update_favorite_memo', { p_room_id: roomId, p_memo: memo }),
  reorderFavorites: (roomIds) => rpc('reorder_favorites', { p_room_ids: roomIds }),

  setRating: (roomId, criterion, score) =>
    rpc('set_rating', { p_room_id: roomId, p_criterion: criterion, p_score: score }),

  setCompare: (roomIds) => rpc('set_compare', { p_room_ids: roomIds }),
  setCompareOptions: (bbq, fire, extraIds) =>
    rpc('set_compare_options', { p_bbq: bbq, p_fire: fire, p_extra_ids: extraIds }),

  setTrip: (checkIn, checkOut) => rpc('set_trip', { p_check_in: checkIn, p_check_out: checkOut }),

  importBackup: (data) => rpc('import_backup', { p: data }),
}

export const auth = {
  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },
  onChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session))
    return () => data.subscription.unsubscribe()
  },
  async signIn(email, password) {
    let res
    try {
      res = await supabase.auth.signInWithPassword({ email, password })
    } catch (err) {
      throw toApiError({ message: err?.message || 'Failed to fetch' })
    }
    if (res.error) {
      if (/invalid login credentials/i.test(res.error.message))
        throw new ApiError('auth', '이메일 또는 비밀번호가 맞지 않아.')
      if (/rate limit|too many/i.test(res.error.message))
        throw new ApiError('auth', '로그인 시도가 너무 많아. 잠시 후 다시 시도해 줘.')
      if (/fetch|network/i.test(res.error.message)) throw toApiError(res.error)
      throw new ApiError('auth', res.error.message)
    }
    return res.data.session
  },
  async signOut() {
    await supabase.auth.signOut().catch(() => {})
  },
}
