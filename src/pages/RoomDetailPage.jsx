import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, ExternalLink, Pencil, Star } from 'lucide-react'
import ImageGallery from '../components/room/ImageGallery.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import { RatingInput } from '../components/common/fields.jsx'
import { useToast } from '../components/common/Toast.jsx'
import PriceCalculator from '../components/compare/PriceCalculator.jsx'
import { CompareButton, FavoriteButton } from '../components/room/RoomActions.jsx'
import DeleteRoomButton from '../components/room/DeleteRoomButton.jsx'
import { AvailabilityChip, FacilityStatus, RatingBadge, TextOrNA, guestText } from '../components/room/roomDisplay.jsx'
import { useDerived, useIsGuest, useStore } from '../store/AppStore.jsx'
import { AVAILABILITY, EXTRA_KIND, FACILITIES, MOOD_FIELDS, RATING_CRITERIA } from '../utils/models.js'
import { effectiveExtraPrice, formatWon, ratingSummary } from '../utils/price.js'
import { formatRangeKey } from '../utils/date.js'

export default function RoomDetailPage() {
  const { roomId } = useParams()
  const { roomsById, staysById, key, myRatings, partnerRatings, partner } = useDerived()
  const isGuest = useIsGuest()
  const { state, actions } = useStore()
  const toast = useToast()
  const room = roomsById[roomId]
  const [selection, setSelection] = useState(() => ({
    bbq: state.compareOptions.bbq,
    fire: state.compareOptions.fire,
    custom: state.compareOptions.custom[roomId] || {},
  }))

  if (!room) {
    return (
      <EmptyState icon={BedDouble} title="객실을 찾을 수 없어" description="삭제되었거나 주소가 잘못됐어." action={<Link to="/" className="btn-primary">홈으로</Link>} />
    )
  }
  const stay = staysById[room.stayId]
  const mine = myRatings[room.id] || {}
  const summary = ratingSummary(mine)
  const rateKeys = Object.keys(room.rates).sort()

  async function rate(criterion, score) {
    try {
      await actions.setRating(room.id, criterion, score)
    } catch (err) {
      toast.error(err)
    }
  }
  function toggle(extra) {
    setSelection((s) => {
      if (extra.kind === EXTRA_KIND.bbq) return { ...s, bbq: !s.bbq }
      if (extra.kind === EXTRA_KIND.fire) return { ...s, fire: !s.fire }
      return { ...s, custom: { ...s.custom, [extra.id]: !s.custom[extra.id] } }
    })
  }

  return (
    <div className="space-y-6">
      <Link to={`/stays/${room.stayId}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {stay?.name}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <ImageGallery images={room.images} alt={room.name} thumbnails />

        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-muted">{stay?.name}{stay?.region && ` · ${stay.region}`}</p>
            <h1 className="mt-1 font-serif text-3xl font-bold leading-tight">{room.name}</h1>
            <p className="mt-2 text-sm text-ink/75">
              {[guestText(room), room.size, room.bedType].filter(Boolean).join(' · ') || <span className="muted-na">인원·크기 정보 확인 필요</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FavoriteButton room={room} withLabel />
            <CompareButton room={room} withLabel />
            {!isGuest && (
              <Link to={`/stays/${room.stayId}/rooms/${room.id}/edit`} className="btn-outline">
                <Pencil className="size-4" aria-hidden /> 수정
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{formatRangeKey(key)} 예약</span>
            <AvailabilityChip room={room} rangeKey={key} />
          </div>
          <PriceCalculator room={room} rangeKey={key} selection={selection} onToggle={toggle} />
          {room.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{room.description}</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-4">시설</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {FACILITIES.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
                <dt className="text-ink/75">{f.label}</dt>
                <dd><FacilityStatus status={room.facilities[f.key]} /></dd>
              </div>
            ))}
          </dl>
        </section>

        {!isGuest && (
        <section className="card p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2">
              <Star className="size-5 text-gold" aria-hidden /> 내 평가
            </h2>
            <span className="text-sm">
              {summary.count ? (
                <>
                  평균 <b className="tabular-nums">{summary.average.toFixed(1)}</b>
                  <span className="text-muted"> · {summary.count}/{summary.total} 평가{!summary.complete && ' · 일부 항목만 평가됨'}</span>
                </>
              ) : (
                <span className="text-muted">아직 평가하지 않았어</span>
              )}
            </span>
          </div>
          <div className="divide-y divide-line/60">
            {RATING_CRITERIA.map((c) => (
              <RatingInput key={c.key} label={c.label} value={mine[c.key] ?? null} onChange={(v) => rate(c.key, v)} />
            ))}
          </div>
          {partner && (
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-cream px-4 py-3 text-sm">
              <span className="text-muted">{partner.displayName}의 평가</span>
              <RatingBadge ratings={partnerRatings[room.id]} />
            </div>
          )}
        </section>
        )}

        <section className="card p-6">
          <h2 className="section-title mb-4">분위기</h2>
          <dl className="space-y-3 text-sm">
            {MOOD_FIELDS.map((m) => (
              <div key={m.key}>
                <dt className="text-xs font-semibold text-muted">{m.label}</dt>
                <dd className="mt-0.5"><TextOrNA value={room.mood[m.key]} /></dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-6">
          <h2 className="section-title mb-4">이용 정보</h2>
          <dl className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs font-semibold text-muted">체크인</dt>
                <dd className="mt-0.5"><TextOrNA value={room.checkIn} /></dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">체크아웃</dt>
                <dd className="mt-0.5"><TextOrNA value={room.checkOut} /></dd>
              </div>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">예약 링크</dt>
              <dd className="mt-0.5">
                {room.bookingUrl ? (
                  <a href={room.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-pine hover:underline">
                    예약 페이지 열기 <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="muted-na">미입력</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">취소 및 환불 규정</dt>
              <dd className="mt-0.5"><TextOrNA value={room.cancelPolicy} /></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">기타 메모</dt>
              <dd className="mt-0.5"><TextOrNA value={room.notes} na="미입력" /></dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="section-title px-6 pt-6">날짜별 가격</h2>
        {rateKeys.length === 0 ? (
          <p className="px-6 pb-6 pt-2 text-sm text-muted">입력된 날짜별 가격이 없어</p>
        ) : (
          <div className="scrollbar-thin overflow-x-auto px-6 pb-6 pt-3">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-semibold">날짜</th>
                  <th className="py-2 font-semibold">숙박비</th>
                  {room.extras.map((e) => (
                    <th key={e.id} className="py-2 font-semibold">{e.name}</th>
                  ))}
                  <th className="py-2 font-semibold">예약</th>
                </tr>
              </thead>
              <tbody>
                {rateKeys.map((k) => {
                  const r = room.rates[k]
                  return (
                    <tr key={k} className={`border-b border-line/60 ${k === key ? 'bg-gold-soft/60' : ''}`}>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {formatRangeKey(k)}
                        {k === key && <span className="ml-1 text-[11px] font-semibold text-burgundy">현재</span>}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums font-semibold">{r.roomPrice !== null ? formatWon(r.roomPrice) : <span className="muted-na font-normal">미입력</span>}</td>
                      {room.extras.map((e) => {
                        const p = effectiveExtraPrice(e, r)
                        return (
                          <td key={e.id} className="py-2.5 pr-3 tabular-nums">
                            {p !== null ? formatWon(p) : <span className="muted-na">미확인</span>}
                          </td>
                        )
                      })}
                      <td className="py-2.5 text-xs">
                        {AVAILABILITY[r.availability]}
                        {r.checkedAt && <span className="text-muted"> ({r.checkedAt.slice(5)})</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <DeleteRoomButton room={room} />
      </div>
    </div>
  )
}
