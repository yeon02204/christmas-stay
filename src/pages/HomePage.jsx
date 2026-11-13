import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileJson, GitCompareArrows, Heart, MapPin, Plus, Search, SearchX, Tent } from 'lucide-react'
import EmptyState from '../components/common/EmptyState.jsx'
import StayCard from '../components/stay/StayCard.jsx'
import { useDerived, useIsGuest, useStore } from '../store/AppStore.jsx'
import { STAY_TYPE_LABEL, STAY_TYPES } from '../utils/models.js'
import { lowestRoomPrice } from '../utils/price.js'

const NONE = '__none__' // 지역 미입력 / 유형 미분류 칩

const SORTS = {
  recent: '최근 등록순',
  priceAsc: '가격 낮은순',
  priceDesc: '가격 높은순',
}

export default function HomePage() {
  const { state } = useStore()
  const { roomsByStay, favoriteIds, key } = useDerived()
  const isGuest = useIsGuest()
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('') // '' = 전체, NONE = 지역 미입력
  const [stayType, setStayType] = useState('') // '' = 전체, NONE = 유형 미분류
  const [sort, setSort] = useState('recent')
  const [favOnly, setFavOnly] = useState(false)

  // 칩 필터 목록: 실제로 등록된 지역·유형만, 개수와 함께 (전체 숙소 기준)
  const regionOptions = useMemo(() => {
    const count = new Map()
    for (const s of state.stays) {
      const r = s.region.trim() || NONE
      count.set(r, (count.get(r) || 0) + 1)
    }
    const named = [...count.keys()].filter((r) => r !== NONE).sort((a, b) => a.localeCompare(b, 'ko'))
    const opts = named.map((r) => ({ value: r, label: r, count: count.get(r) }))
    if (count.has(NONE) && named.length) opts.push({ value: NONE, label: '지역 미입력', count: count.get(NONE) })
    return opts
  }, [state.stays])

  const typeOptions = useMemo(() => {
    const count = new Map()
    for (const s of state.stays) {
      const t = STAY_TYPE_LABEL[s.stayType] ? s.stayType : NONE
      count.set(t, (count.get(t) || 0) + 1)
    }
    const opts = STAY_TYPES.filter((t) => count.has(t.key)).map((t) => ({ value: t.key, label: t.label, count: count.get(t.key) }))
    if (count.has(NONE) && opts.length) opts.push({ value: NONE, label: '유형 미정', count: count.get(NONE) })
    return opts
  }, [state.stays])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let items = state.stays.map((stay) => {
      const all = roomsByStay[stay.id] || []
      const rooms = favOnly ? all.filter((r) => favoriteIds.has(r.id)) : all
      return { stay, rooms, price: lowestRoomPrice(rooms, key) }
    })
    if (q) items = items.filter((x) => x.stay.name.toLowerCase().includes(q))
    if (region) items = items.filter((x) => (x.stay.region.trim() || NONE) === region)
    if (stayType) items = items.filter((x) => (STAY_TYPE_LABEL[x.stay.stayType] ? x.stay.stayType : NONE) === stayType)
    if (favOnly) items = items.filter((x) => x.rooms.length > 0)
    const byRecent = (a, b) => (b.stay.createdAt || '').localeCompare(a.stay.createdAt || '')
    if (sort === 'recent') items.sort(byRecent)
    else {
      // 가격 미입력 숙소는 정렬 방향과 관계없이 항상 뒤로
      items.sort((a, b) => {
        if (a.price === null && b.price === null) return byRecent(a, b)
        if (a.price === null) return 1
        if (b.price === null) return -1
        return sort === 'priceAsc' ? a.price - b.price : b.price - a.price
      })
    }
    return items
  }, [state.stays, roomsByStay, favoriteIds, key, query, region, stayType, sort, favOnly])

  const filtered = query || region || stayType || favOnly

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-burgundy via-burgundy-deep to-[#4a1520] px-6 py-8 text-white shadow-lift md:px-10 md:py-11">
        <HeroDecor />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-gold">CHRISTMAS STAY · 2026</p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-snug md:text-4xl">우리의 겨울 여행을 찾아서 ❄️</h1>
            <p className="mt-2 text-white/80">어떤 곳에서 크리스마스를 보낼까?</p>
          </div>
          {!isGuest && <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <Link to="/stays/new" className="btn bg-white text-burgundy hover:bg-gold-soft">
              <Plus className="size-4" aria-hidden /> 숙소 등록
            </Link>
            <Link to="/stays/import" className="btn border border-white/40 text-white hover:bg-white/10">
              <FileJson className="size-4" aria-hidden /> JSON 일괄 등록
            </Link>
          </div>}
        </div>
        <div className="relative mt-7 grid grid-cols-3 gap-2 md:max-w-lg">
          <Stat label="숙소 후보" value={state.stays.length} icon={Tent} />
          {!isGuest && <Stat label="찜한 객실" value={state.favorites.length} icon={Heart} to="/favorites" />}
          <Stat label="비교 목록" value={`${state.compare.length}/3`} icon={GitCompareArrows} to="/compare" />
        </div>
      </section>

      {state.stays.length === 0 ? (
        <EmptyState
          icon={Tent}
          title="아직 등록된 숙소가 없어!"
          description="마음에 드는 글램핑 숙소를 하나씩 추가해 보자."
          action={
            !isGuest && <div className="flex flex-wrap justify-center gap-2">
              <Link to="/stays/new" className="btn-primary">
                <Plus className="size-4" aria-hidden /> 숙소 등록
              </Link>
              <Link to="/stays/import" className="btn-outline">
                <FileJson className="size-4" aria-hidden /> JSON 일괄 등록
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="card flex flex-col gap-3 p-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">숙소명 검색</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input border-transparent bg-cream pl-10" placeholder="숙소명 검색" value={query} onChange={(e) => setQuery(e.target.value)} type="search" />
            </label>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <label className={isGuest ? 'col-span-2' : undefined}>
                <span className="sr-only">정렬</span>
                <select className="input border-transparent bg-cream md:w-36" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              {!isGuest && <button
                type="button"
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                className={`btn ${favOnly ? 'bg-burgundy text-white' : 'bg-cream text-ink/75 hover:text-ink'}`}
              >
                <Heart className={`size-4 ${favOnly ? 'fill-white' : ''}`} aria-hidden /> 찜한 객실만
              </button>}
            </div>
          </div>

          {(typeOptions.length > 0 || regionOptions.length > 0) && (
            <div className="-mt-2 space-y-2">
              {typeOptions.length > 0 && (
                <ChipFilter label="숙소 유형" allLabel="전체 유형" icon={Tent} options={typeOptions} value={stayType} onChange={setStayType} total={state.stays.length} />
              )}
              {regionOptions.length > 0 && (
                <ChipFilter label="지역" allLabel="전체 지역" icon={MapPin} options={regionOptions} value={region} onChange={setRegion} total={state.stays.length} />
              )}
            </div>
          )}

          {sort !== 'recent' && <p className="-mt-2 text-xs text-muted">객실 최저 숙박비 기준 · 가격 미입력 숙소는 맨 뒤에 표시돼</p>}

          {list.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title={favOnly && !query && !region && !stayType ? '찜한 객실이 있는 숙소가 없어' : '조건에 맞는 숙소가 없어'}
              description="검색어나 필터를 바꿔 볼래?"
              action={
                filtered && (
                  <button
                    className="btn-outline"
                    onClick={() => {
                      setQuery('')
                      setRegion('')
                      setStayType('')
                      setFavOnly(false)
                    }}
                  >
                    필터 초기화
                  </button>
                )
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map(({ stay, rooms }) => (
                <StayCard key={stay.id} stay={stay} rooms={rooms} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 한 줄 칩 필터. 모바일에서는 가로로 밀어서 보고, 화면 전체가 가로로 넘치지 않는다 */
function ChipFilter({ label, allLabel, icon: Icon, options, value, onChange, total }) {
  const chip = (active) =>
    `chip shrink-0 min-h-9 px-3 text-[13px] transition-colors ${
      active ? 'bg-burgundy text-white' : 'bg-white text-ink/75 shadow-soft hover:bg-gold-soft hover:text-ink'
    }`
  return (
    <div role="group" aria-label={`${label} 필터`} className="scrollbar-thin -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <button type="button" className={chip(value === '')} aria-pressed={value === ''} onClick={() => onChange('')}>
        {allLabel} <span className="tabular-nums opacity-70">{total}</span>
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={chip(value === o.value)}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? '' : o.value)}
        >
          {o.label} <span className="tabular-nums opacity-70">{o.count}</span>
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value, icon: Icon, to }) {
  const inner = (
    <>
      <p className="flex items-center gap-1 text-[11px] font-medium text-white/70">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </>
  )
  const cls = 'rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm'
  return to ? (
    <Link to={to} className={`${cls} transition-colors hover:bg-white/20`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function HeroDecor() {
  return (
    <svg className="pointer-events-none absolute -right-6 -top-4 h-[130%] opacity-[0.13]" viewBox="0 0 200 220" aria-hidden>
      <path d="M100 10 150 90H50Z M100 50 170 150H30Z M100 100 190 210H10Z" fill="#fff" />
      <circle cx="100" cy="8" r="7" fill="#C4A46B" />
    </svg>
  )
}
