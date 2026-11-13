import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitCompareArrows, Heart, Plus, Search, SearchX, Tent } from 'lucide-react'
import EmptyState from '../components/common/EmptyState.jsx'
import StayCard from '../components/stay/StayCard.jsx'
import { useDerived, useStore } from '../store/AppStore.jsx'
import { lowestRoomPrice } from '../utils/price.js'

const SORTS = {
  recent: '최근 등록순',
  priceAsc: '가격 낮은순',
  priceDesc: '가격 높은순',
}

export default function HomePage() {
  const { state } = useStore()
  const { roomsByStay, favoriteIds, key } = useDerived()
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [sort, setSort] = useState('recent')
  const [favOnly, setFavOnly] = useState(false)

  const regions = useMemo(
    () => [...new Set(state.stays.map((s) => s.region.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [state.stays],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let items = state.stays.map((stay) => {
      const all = roomsByStay[stay.id] || []
      const rooms = favOnly ? all.filter((r) => favoriteIds.has(r.id)) : all
      return { stay, rooms, price: lowestRoomPrice(rooms, key) }
    })
    if (q) items = items.filter((x) => x.stay.name.toLowerCase().includes(q))
    if (region) items = items.filter((x) => x.stay.region.trim() === region)
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
  }, [state.stays, roomsByStay, favoriteIds, key, query, region, sort, favOnly])

  const filtered = query || region || favOnly

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
          <Link to="/stays/new" className="btn self-start bg-white text-burgundy hover:bg-gold-soft md:self-auto">
            <Plus className="size-4" aria-hidden /> 숙소 등록
          </Link>
        </div>
        <div className="relative mt-7 grid grid-cols-3 gap-2 md:max-w-lg">
          <Stat label="숙소 후보" value={state.stays.length} icon={Tent} />
          <Stat label="찜한 객실" value={state.favorites.length} icon={Heart} to="/favorites" />
          <Stat label="비교 목록" value={`${state.compare.length}/3`} icon={GitCompareArrows} to="/compare" />
        </div>
      </section>

      {state.stays.length === 0 ? (
        <EmptyState
          icon={Tent}
          title="아직 등록된 숙소가 없어!"
          description="마음에 드는 글램핑 숙소를 하나씩 추가해 보자."
          action={
            <Link to="/stays/new" className="btn-primary">
              <Plus className="size-4" aria-hidden /> 숙소 등록
            </Link>
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
              <label>
                <span className="sr-only">지역 필터</span>
                <select className="input border-transparent bg-cream md:w-36" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">전체 지역</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">정렬</span>
                <select className="input border-transparent bg-cream md:w-36" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                className={`btn col-span-2 md:col-span-1 ${favOnly ? 'bg-burgundy text-white' : 'bg-cream text-ink/75 hover:text-ink'}`}
              >
                <Heart className={`size-4 ${favOnly ? 'fill-white' : ''}`} aria-hidden /> 찜한 객실만
              </button>
            </div>
          </div>

          {sort !== 'recent' && <p className="-mt-2 text-xs text-muted">객실 최저 숙박비 기준 · 가격 미입력 숙소는 맨 뒤에 표시돼</p>}

          {list.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title={favOnly && !query && !region ? '찜한 객실이 있는 숙소가 없어' : '조건에 맞는 숙소가 없어'}
              description="검색어나 필터를 바꿔 볼래?"
              action={
                filtered && (
                  <button
                    className="btn-outline"
                    onClick={() => {
                      setQuery('')
                      setRegion('')
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
