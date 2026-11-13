import { Link } from 'react-router-dom'
import { BedDouble, ChevronRight, Heart, MapPin, Tent } from 'lucide-react'
import Photo from '../common/Photo.jsx'
import { CompareButton, FavoriteButton } from '../room/RoomActions.jsx'
import { RoomPrice } from '../room/roomDisplay.jsx'
import { formatWon, lowestRoomPrice } from '../../utils/price.js'
import { STAY_TYPE_LABEL } from '../../utils/models.js'
import { useDerived } from '../../store/AppStore.jsx'

export default function StayCard({ stay, rooms }) {
  const { key, favoriteIds } = useDerived()
  const lowest = lowestRoomPrice(rooms, key)
  const favCount = rooms.filter((r) => favoriteIds.has(r.id)).length
  const cover = stay.coverImage || rooms.find((r) => r.images.length)?.images[0] || null
  const shown = rooms.slice(0, 3)

  return (
    <article className="card group flex animate-fade-up flex-col overflow-hidden transition-shadow hover:shadow-lift">
      <Link to={`/stays/${stay.id}`} className="relative block overflow-hidden" aria-label={`${stay.name} 상세 보기`}>
        <Photo image={cover} alt={stay.name} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.03]" iconSize="size-10" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="flex flex-wrap gap-1.5">
            {STAY_TYPE_LABEL[stay.stayType] && (
              <span className="chip bg-pine text-white shadow-soft">
                <Tent className="size-3.5" aria-hidden />
                {STAY_TYPE_LABEL[stay.stayType]}
              </span>
            )}
            {stay.region && (
              <span className="chip bg-white/90 text-ink shadow-soft backdrop-blur">
                <MapPin className="size-3.5 text-burgundy" aria-hidden />
                {stay.region}
              </span>
            )}
          </div>
          {favCount > 0 && (
            <span className="chip bg-burgundy text-white shadow-soft">
              <Heart className="size-3.5 fill-white" aria-hidden />
              {favCount}
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-xl font-bold leading-snug">
          <Link to={`/stays/${stay.id}`} className="hover:text-burgundy">
            {stay.name}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          <BedDouble className="size-4" aria-hidden />
          객실 {rooms.length}개
        </p>

        <div className="mt-3 rounded-2xl bg-cream px-3.5 py-2.5">
          {lowest !== null ? (
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted">최저 숙박비</span>
              <span className="text-lg font-bold tabular-nums text-burgundy">{formatWon(lowest)}~</span>
            </p>
          ) : (
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted">최저 숙박비</span>
              <span className="text-sm font-medium text-muted">가격 미입력</span>
            </p>
          )}
        </div>

        {shown.length > 0 && (
          <ul className="mt-3 divide-y divide-line/70">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <Link to={`/stays/${stay.id}/rooms/${r.id}`} className="min-w-0 flex-1 hover:text-burgundy">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <RoomPrice room={r} rangeKey={key} className="text-[13px]" />
                </Link>
                <FavoriteButton room={r} size="sm" />
                <CompareButton room={r} size="sm" />
              </li>
            ))}
          </ul>
        )}
        {rooms.length > 3 && <p className="text-xs text-muted">외 {rooms.length - 3}개 객실</p>}

        <div className="mt-auto pt-4">
          <Link to={`/stays/${stay.id}`} className="btn-outline w-full">
            숙소 상세 보기 <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}
