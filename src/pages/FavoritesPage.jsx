import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Heart } from 'lucide-react'
import EmptyState from '../components/common/EmptyState.jsx'
import Photo from '../components/common/Photo.jsx'
import { useToast } from '../components/common/Toast.jsx'
import { CompareButton, FavoriteButton } from '../components/room/RoomActions.jsx'
import { AvailabilityChip, RatingBadge, RoomPrice } from '../components/room/roomDisplay.jsx'
import { useDerived, useStore } from '../store/AppStore.jsx'

export default function FavoritesPage() {
  const { state } = useStore()
  const { roomsById } = useDerived()
  const items = state.favorites.map((f) => ({ fav: f, room: roomsById[f.roomId] })).filter((x) => x.room)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold md:text-3xl">찜한 객실</h1>
        <p className="mt-1 text-sm text-muted">위·아래 버튼으로 최종 후보 순위를 정해 봐. 찜·메모·순위는 나만 보여.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="아직 찜한 객실이 없어"
          description="객실 카드의 하트를 누르면 여기에 모여."
          action={<Link to="/" className="btn-primary">숙소 둘러보기</Link>}
        />
      ) : (
        <ol className="space-y-3">
          {items.map(({ fav, room }, i) => (
            <FavoriteItem key={room.id} fav={fav} room={room} rank={i + 1} total={items.length} />
          ))}
        </ol>
      )}
    </div>
  )
}

function FavoriteItem({ fav, room, rank, total }) {
  const { actions } = useStore()
  const { staysById, key, myRatings } = useDerived()
  const toast = useToast()
  const stay = staysById[room.stayId]
  const [memo, setMemo] = useState(fav.memo)
  const [saved, setSaved] = useState(false)

  async function saveMemo() {
    if (memo === fav.memo) return
    try {
      await actions.updateFavoriteMemo(room.id, memo)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      toast.error(err)
    }
  }
  const move = (d) => actions.moveFavorite(room.id, d).catch((err) => toast.error(err))

  return (
    <li className="card flex animate-fade-up flex-col gap-4 p-4 sm:flex-row">
      <div className="flex items-start gap-3 sm:w-[55%]">
        <div className="flex flex-col items-center gap-1">
          <span className={`flex size-9 items-center justify-center rounded-full font-serif text-sm font-bold ${rank === 1 ? 'bg-gold text-white' : 'bg-cream-deep text-ink/70'}`} aria-label={`${rank}순위`}>
            {rank}
          </span>
          <button className="icon-btn size-8" onClick={() => move(-1)} disabled={rank === 1} aria-label={`${room.name} 순위 올리기`}>
            <ChevronUp className="size-4" />
          </button>
          <button className="icon-btn size-8" onClick={() => move(1)} disabled={rank === total} aria-label={`${room.name} 순위 내리기`}>
            <ChevronDown className="size-4" />
          </button>
        </div>
        <Link to={`/stays/${room.stayId}/rooms/${room.id}`} className="shrink-0">
          <Photo image={room.images[0] || stay?.coverImage} alt={room.name} className="size-24 rounded-2xl sm:size-28" iconSize="size-6" />
        </Link>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-xs font-semibold text-muted">{stay?.name}</p>
          <Link to={`/stays/${room.stayId}/rooms/${room.id}`} className="block font-serif text-lg font-bold leading-snug hover:text-burgundy">
            {room.name}
          </Link>
          <RoomPrice room={room} rangeKey={key} />
          <div className="flex flex-wrap gap-1.5">
            <AvailabilityChip room={room} rangeKey={key} />
            <RatingBadge ratings={myRatings[room.id]} />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label className="flex-1">
          <span className="sr-only">{room.name} 개인 메모</span>
          <textarea
            className="input h-full min-h-20 resize-y text-sm"
            placeholder="개인 메모 (예: 여기가 1순위인 이유)"
            value={memo}
            maxLength={2000}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={saveMemo}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted" aria-live="polite">{saved ? '메모 저장됨' : ''}</span>
          <div className="flex gap-2">
            <CompareButton room={room} size="sm" />
            <FavoriteButton room={room} size="sm" />
          </div>
        </div>
      </div>
    </li>
  )
}
