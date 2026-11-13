const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function rangeKey(trip) {
  return `${trip.checkIn}_${trip.checkOut}`
}

export function parseRangeKey(key) {
  const [checkIn, checkOut] = String(key).split('_')
  return { checkIn, checkOut }
}

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = toDate(v)
  return !Number.isNaN(d.getTime()) && v === formatIso(d)
}

function formatIso(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function nightsBetween(checkIn, checkOut) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return 0
  return Math.round((toDate(checkOut) - toDate(checkIn)) / 86400000)
}

export function formatDateShort(iso) {
  if (!isIsoDate(iso)) return iso || ''
  const d = toDate(iso)
  return `${d.getMonth() + 1}.${d.getDate()} (${WEEKDAYS[d.getDay()]})`
}

export function formatRange(trip) {
  const n = nightsBetween(trip.checkIn, trip.checkOut)
  return `${formatDateShort(trip.checkIn)} → ${formatDateShort(trip.checkOut)}${n > 0 ? ` · ${n}박` : ''}`
}

export function formatRangeKey(key) {
  return formatRange(parseRangeKey(key))
}

export function todayIso() {
  return formatIso(new Date())
}
