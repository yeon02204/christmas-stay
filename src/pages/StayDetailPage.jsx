import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, Copy, ExternalLink, Home, MapPin, Pencil, Plus, Tent } from 'lucide-react'
import Photo from '../components/common/Photo.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import RoomCard from '../components/room/RoomCard.jsx'
import DeleteStayButton from '../components/stay/DeleteStayButton.jsx'
import { useToast } from '../components/common/Toast.jsx'
import { useDerived, useIsGuest } from '../store/AppStore.jsx'
import { formatWon, lowestRoomPrice } from '../utils/price.js'
import { formatRangeKey } from '../utils/date.js'
import { STAY_TYPE_LABEL } from '../utils/models.js'

export default function StayDetailPage() {
  const isGuest = useIsGuest()
  const { stayId } = useParams()
  const { staysById, roomsByStay, key } = useDerived()
  const toast = useToast()
  const stay = staysById[stayId]

  if (!stay) {
    return (
      <EmptyState
        icon={Home}
        title="숙소를 찾을 수 없어"
        description="삭제되었거나 주소가 잘못됐어."
        action={<Link to="/" className="btn-primary">홈으로</Link>}
      />
    )
  }
  const rooms = roomsByStay[stay.id] || []
  const cover = stay.coverImage || rooms.find((r) => r.images.length)?.images[0] || null
  const lowest = lowestRoomPrice(rooms, key)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(stay.address)
      toast.success('주소를 복사했어')
    } catch {
      toast.error('복사하지 못했어. 주소를 길게 눌러 직접 복사해 줘.')
    }
  }

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> 숙소 목록
      </Link>

      <section className="card overflow-hidden md:grid md:grid-cols-[1.15fr_1fr]">
        <Photo image={cover} alt={stay.name} className="aspect-[4/3] w-full md:aspect-auto md:h-full md:min-h-80" iconSize="size-12" />
        <div className="flex flex-col gap-4 p-6 md:p-8">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {STAY_TYPE_LABEL[stay.stayType] && (
                <span className="chip bg-pine-soft text-pine">
                  <Tent className="size-3.5" aria-hidden /> {STAY_TYPE_LABEL[stay.stayType]}
                </span>
              )}
              {stay.region && (
                <span className="chip bg-gold-soft text-ink">
                  <MapPin className="size-3.5 text-burgundy" aria-hidden /> {stay.region}
                </span>
              )}
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight">{stay.name}</h1>
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted">주소</dt>
              <dd className="mt-0.5 flex items-start gap-2">
                {stay.address ? (
                  <>
                    <span className="flex-1">{stay.address}</span>
                    <button type="button" className="btn-outline btn-sm" onClick={copyAddress}>
                      <Copy className="size-3.5" aria-hidden /> 복사
                    </button>
                  </>
                ) : (
                  <span className="muted-na">미입력</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">홈페이지</dt>
              <dd className="mt-0.5">
                {stay.homepageUrl ? (
                  <a href={stay.homepageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-pine underline-offset-2 hover:underline">
                    {stay.homepageUrl.replace(/^https?:\/\//, '').slice(0, 50)}
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <span className="muted-na">미입력</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">최저 숙박비 ({formatRangeKey(key)})</dt>
              <dd className="mt-0.5 font-bold text-burgundy">{lowest !== null ? `${formatWon(lowest)}~` : <span className="font-normal muted-na">가격 미입력</span>}</dd>
            </div>
          </dl>

          {stay.memo && (
            <div className="rounded-2xl bg-cream p-4 text-sm leading-relaxed whitespace-pre-line">{stay.memo}</div>
          )}

          {!isGuest && (
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Link to={`/stays/${stay.id}/edit`} className="btn-outline">
                <Pencil className="size-4" aria-hidden /> 숙소 수정
              </Link>
              <DeleteStayButton stay={stay} className="btn-ghost text-burgundy" />
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-bold">
            <BedDouble className="size-6 text-gold" aria-hidden /> 객실 <span className="text-muted">{rooms.length}</span>
          </h2>
          {!isGuest && (
            <Link to={`/stays/${stay.id}/rooms/new`} className="btn-primary">
              <Plus className="size-4" aria-hidden /> 객실 추가
            </Link>
          )}
        </div>
        {rooms.length === 0 ? (
          <EmptyState
            compact
            icon={BedDouble}
            title="아직 등록된 객실이 없어"
            description="객실별로 가격과 시설이 달라서, 객실을 추가해야 비교할 수 있어."
            action={
              !isGuest && <Link to={`/stays/${stay.id}/rooms/new`} className="btn-primary">
                <Plus className="size-4" aria-hidden /> 첫 객실 추가하기
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
