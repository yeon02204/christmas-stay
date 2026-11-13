import { Check, HelpCircle, Minus, Star } from 'lucide-react'
import { AVAILABILITY, FACILITIES } from '../../utils/models.js'
import { formatWon, getRate, ratingSummary } from '../../utils/price.js'
import { NA } from '../common/fields.jsx'

export function FacilityStatus({ status }) {
  if (status === 'yes')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-pine">
        <Check className="size-4" aria-hidden /> 있음
      </span>
    )
  if (status === 'no')
    return (
      <span className="inline-flex items-center gap-1 text-ink/60">
        <Minus className="size-4" aria-hidden /> 없음
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <HelpCircle className="size-4" aria-hidden /> 확인 필요
    </span>
  )
}

/** '있음' 시설 칩 목록 (최대 n개) */
export function FacilityChips({ facilities, max = 6 }) {
  const yes = FACILITIES.filter((f) => facilities?.[f.key] === 'yes')
  if (!yes.length) return <p className="text-xs text-muted">시설 정보 확인 필요</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {yes.slice(0, max).map((f) => (
        <li key={f.key} className="chip bg-pine-soft text-pine">
          {f.label}
        </li>
      ))}
      {yes.length > max && <li className="chip bg-cream-deep text-muted">+{yes.length - max}</li>}
    </ul>
  )
}

const AVAIL_STYLE = {
  unchecked: 'bg-gold-soft text-ink/70',
  available: 'bg-pine-soft text-pine',
  unavailable: 'bg-burgundy-soft text-burgundy',
}

export function AvailabilityChip({ room, rangeKey }) {
  const rate = getRate(room, rangeKey)
  if (!rate) return <span className="chip bg-cream-deep text-muted">이 날짜 예약 정보 없음</span>
  return (
    <span className={`chip ${AVAIL_STYLE[rate.availability]}`}>
      {AVAILABILITY[rate.availability]}
      {rate.checkedAt && rate.availability !== 'unchecked' && (
        <span className="font-normal opacity-75">· {rate.checkedAt.slice(5).replace('-', '/')} 확인</span>
      )}
    </span>
  )
}

/** 선택한 날짜의 기본 숙박비 표시 */
export function RoomPrice({ room, rangeKey, className = '' }) {
  const rate = getRate(room, rangeKey)
  if (!rate) return <span className={`text-sm text-muted ${className}`}>이 날짜 가격 정보 없음</span>
  if (rate.roomPrice === null) return <span className={`text-sm text-muted ${className}`}>숙박비 미입력</span>
  return <span className={`font-bold tabular-nums text-ink ${className}`}>{formatWon(rate.roomPrice)}</span>
}

export function RatingBadge({ ratings, label }) {
  const s = ratingSummary(ratings)
  if (!s.count)
    return (
      <span className="chip bg-cream-deep text-muted">
        {label && `${label} `}미평가
      </span>
    )
  return (
    <span className="chip bg-gold-soft text-ink" title={s.complete ? '모든 항목 평가 완료' : '일부 항목만 평가됨'}>
      <Star className="size-3.5 fill-gold text-gold" aria-hidden />
      {label && <span className="text-muted">{label}</span>}
      <b className="tabular-nums">{s.average.toFixed(1)}</b>
      <span className="font-normal text-muted">({s.count}/{s.total}{s.complete ? '' : ' · 일부'})</span>
    </span>
  )
}

export function TextOrNA({ value, na = '확인 필요' }) {
  return value?.toString().trim() ? <span className="whitespace-pre-line">{value}</span> : <NA>{na}</NA>
}

export function guestText(room) {
  if (room.baseGuests && room.maxGuests) return `기준 ${room.baseGuests}명 · 최대 ${room.maxGuests}명`
  if (room.baseGuests) return `기준 ${room.baseGuests}명`
  if (room.maxGuests) return `최대 ${room.maxGuests}명`
  return null
}
