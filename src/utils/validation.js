import {
  AVAILABILITY,
  createEmptyData,
  createEmptyRoom,
  createEmptyStay,
  FACILITIES,
  FACILITY_STATUS,
  MOOD_FIELDS,
  RATING_CRITERIA,
  SCHEMA_VERSION,
} from './models.js'
import { isIsoDate, nightsBetween } from './date.js'

export function isValidUrl(value) {
  if (!value) return true // 빈 값은 허용 (선택 항목)
  try {
    const u = new URL(value)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && u.hostname.includes('.')
  } catch {
    return false
  }
}

/** 사용자가 'www.example.com' 처럼 입력하면 https:// 를 붙여준다 */
export function normalizeUrlInput(value) {
  const v = String(value ?? '').trim()
  if (!v) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`
  return v
}

export function validateStay(stay) {
  const errors = {}
  if (!stay.name?.trim()) errors.name = '숙소명을 입력해 줘'
  if (!isValidUrl(stay.homepageUrl)) errors.homepageUrl = 'http:// 또는 https:// 로 시작하는 주소를 입력해 줘'
  if (stay.coverImage?.type === 'url' && !isValidUrl(stay.coverImage.url))
    errors.coverImage = '이미지 주소가 올바르지 않아'
  return errors
}

export function validateRoom(room) {
  const errors = {}
  if (!room.name?.trim()) errors.name = '객실명을 입력해 줘'
  if (!isValidUrl(room.bookingUrl)) errors.bookingUrl = 'http:// 또는 https:// 로 시작하는 주소를 입력해 줘'
  for (const k of ['baseGuests', 'maxGuests']) {
    const v = room[k]
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 99)) errors[k] = '1~99 사이 숫자로 입력해 줘'
  }
  if (!errors.baseGuests && !errors.maxGuests && room.baseGuests && room.maxGuests && room.maxGuests < room.baseGuests)
    errors.maxGuests = '최대 인원은 기준 인원보다 적을 수 없어'
  room.extras.forEach((e) => {
    if (!e.name?.trim()) errors[`extra_${e.id}`] = '항목명을 입력해 줘'
    if (e.defaultPrice !== null && (!Number.isInteger(e.defaultPrice) || e.defaultPrice < 0))
      errors[`extra_${e.id}`] = '금액이 올바르지 않아'
  })
  Object.entries(room.rates).forEach(([key, rate]) => {
    if (rate.roomPrice !== null && (!Number.isInteger(rate.roomPrice) || rate.roomPrice < 0))
      errors[`rate_${key}`] = '숙박비가 올바르지 않아'
  })
  room.images.forEach((img, i) => {
    if (img.type === 'url' && !isValidUrl(img.url)) errors[`image_${i}`] = '이미지 주소가 올바르지 않아'
  })
  return errors
}

export function validateTrip(trip) {
  if (!isIsoDate(trip.checkIn) || !isIsoDate(trip.checkOut)) return '날짜를 모두 선택해 줘'
  if (nightsBetween(trip.checkIn, trip.checkOut) < 1) return '체크아웃은 체크인 다음 날 이후여야 해'
  if (nightsBetween(trip.checkIn, trip.checkOut) > 30) return '최대 30박까지 설정할 수 있어'
  return null
}

// ───────────────── 데이터 정규화 / 가져오기 검증 ─────────────────

const str = (v) => (typeof v === 'string' ? v : '')
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
const intOrNull = (v) => (Number.isInteger(v) && v >= 1 && v <= 99 ? v : null)

function normImageRef(ref) {
  if (!ref || typeof ref !== 'object') return null
  if (ref.type === 'url' && typeof ref.url === 'string' && ref.url) return { type: 'url', url: ref.url }
  if (ref.type === 'storage' && typeof ref.path === 'string' && ref.path) return { type: 'storage', path: ref.path }
  if (ref.type === 'local' && typeof ref.id === 'string' && ref.id) return { type: 'local', id: ref.id }
  return null
}

function normStay(s) {
  const base = createEmptyStay()
  return {
    ...base,
    id: s.id,
    name: str(s.name),
    region: str(s.region),
    address: str(s.address),
    homepageUrl: str(s.homepageUrl),
    coverImage: normImageRef(s.coverImage),
    memo: str(s.memo),
    createdAt: str(s.createdAt),
    updatedAt: str(s.updatedAt),
  }
}

function normRoom(r) {
  const base = createEmptyRoom(r.stayId)
  const extras = Array.isArray(r.extras)
    ? r.extras
        .filter((e) => e && typeof e.id === 'string')
        .map((e) => ({
          id: e.id,
          kind: ['bbq', 'fire', 'custom'].includes(e.kind) ? e.kind : 'custom',
          name: str(e.name),
          defaultPrice: numOrNull(e.defaultPrice),
          required: !!e.required,
        }))
    : base.extras
  const rates = {}
  if (r.rates && typeof r.rates === 'object') {
    for (const [key, rate] of Object.entries(r.rates)) {
      const [a, b] = key.split('_')
      if (!isIsoDate(a) || !isIsoDate(b) || !rate || typeof rate !== 'object') continue
      const extraPrices = {}
      if (rate.extraPrices && typeof rate.extraPrices === 'object') {
        for (const [id, p] of Object.entries(rate.extraPrices)) {
          const n = numOrNull(p)
          if (n !== null) extraPrices[id] = n
        }
      }
      rates[key] = {
        roomPrice: numOrNull(rate.roomPrice),
        extraPrices,
        availability: rate.availability in AVAILABILITY ? rate.availability : 'unchecked',
        checkedAt: isIsoDate(rate.checkedAt) ? rate.checkedAt : '',
      }
    }
  }
  const facilities = {}
  FACILITIES.forEach((f) => {
    const v = r.facilities?.[f.key]
    facilities[f.key] = v in FACILITY_STATUS ? v : 'unknown'
  })
  const mood = {}
  MOOD_FIELDS.forEach((m) => (mood[m.key] = str(r.mood?.[m.key])))
  const ratings = {}
  RATING_CRITERIA.forEach((c) => {
    const v = r.ratings?.[c.key]
    ratings[c.key] = Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
  })
  return {
    ...base,
    id: r.id,
    stayId: r.stayId,
    name: str(r.name),
    images: Array.isArray(r.images) ? r.images.map(normImageRef).filter(Boolean) : [],
    baseGuests: intOrNull(r.baseGuests),
    maxGuests: intOrNull(r.maxGuests),
    size: str(r.size),
    bedType: str(r.bedType),
    description: str(r.description),
    extras,
    rates,
    facilities,
    mood,
    checkIn: str(r.checkIn),
    checkOut: str(r.checkOut),
    bookingUrl: str(r.bookingUrl),
    cancelPolicy: str(r.cancelPolicy),
    notes: str(r.notes),
    ratings, // 백업 파일에 담긴 평가 (가져오는 사람의 평가로 복원)
    pros: str(r.pros),
    cons: str(r.cons),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  }
}

/**
 * 저장된 데이터나 가져온 데이터를 안전한 형태로 정리한다.
 * 구조가 근본적으로 잘못된 경우 errors 에 담아 돌려준다.
 */
export function normalizeData(raw) {
  const errors = []
  const warnings = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { data: null, errors: ['데이터 형식이 올바르지 않아 (객체가 아님)'], warnings }
  }
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
    errors.push(`더 새로운 버전(v${raw.schemaVersion})의 데이터라서 읽을 수 없어`)
  }
  if (!Array.isArray(raw.stays)) errors.push('숙소 목록(stays)이 없거나 배열이 아니야')
  if (!Array.isArray(raw.rooms)) errors.push('객실 목록(rooms)이 없거나 배열이 아니야')
  if (errors.length) return { data: null, errors, warnings }

  const data = createEmptyData()
  const stayIds = new Set()
  raw.stays.forEach((s, i) => {
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name.trim()) {
      errors.push(`숙소 ${i + 1}번: id 또는 숙소명이 없어`)
      return
    }
    if (stayIds.has(s.id)) {
      errors.push(`숙소 ${i + 1}번: 중복된 id`)
      return
    }
    stayIds.add(s.id)
    data.stays.push(normStay(s))
  })
  const roomIds = new Set()
  raw.rooms.forEach((r, i) => {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) {
      errors.push(`객실 ${i + 1}번: id 또는 객실명이 없어`)
      return
    }
    if (!stayIds.has(r.stayId)) {
      errors.push(`객실 "${r.name}": 소속 숙소를 찾을 수 없어`)
      return
    }
    if (roomIds.has(r.id)) {
      errors.push(`객실 ${i + 1}번: 중복된 id`)
      return
    }
    roomIds.add(r.id)
    data.rooms.push(normRoom(r))
  })

  if (Array.isArray(raw.favorites)) {
    const seen = new Set()
    raw.favorites.forEach((f) => {
      if (f && roomIds.has(f.roomId) && !seen.has(f.roomId)) {
        seen.add(f.roomId)
        data.favorites.push({ roomId: f.roomId, memo: str(f.memo), addedAt: str(f.addedAt) })
      } else warnings.push('존재하지 않는 객실의 찜 기록을 제외했어')
    })
  }
  if (Array.isArray(raw.compare)) {
    data.compare = [...new Set(raw.compare.filter((id) => roomIds.has(id)))].slice(0, 3)
    if (data.compare.length !== raw.compare.length) warnings.push('비교 목록 중 일부를 정리했어')
  }
  if (raw.compareOptions && typeof raw.compareOptions === 'object') {
    data.compareOptions.bbq = !!raw.compareOptions.bbq
    data.compareOptions.fire = !!raw.compareOptions.fire
    const custom = raw.compareOptions.custom
    if (custom && typeof custom === 'object') {
      for (const [roomId, sel] of Object.entries(custom)) {
        if (roomIds.has(roomId) && sel && typeof sel === 'object') {
          data.compareOptions.custom[roomId] = Object.fromEntries(
            Object.entries(sel).filter(([, v]) => v === true),
          )
        }
      }
    }
  }
  if (raw.trip && validateTrip(raw.trip) === null) data.trip = { checkIn: raw.trip.checkIn, checkOut: raw.trip.checkOut }

  return { data, errors, warnings: [...new Set(warnings)] }
}

/** JSON 백업 파일 검증 */
export function validateBackup(json) {
  if (!json || typeof json !== 'object') return { errors: ['JSON 파일 내용이 비어 있거나 올바르지 않아'] }
  if (json.app !== 'christmas-stay') return { errors: ['Christmas Stay 백업 파일이 아니야'] }
  const { data, errors, warnings } = normalizeData(json.data)
  if (!data || errors.length) return { errors: errors.length ? errors : ['데이터를 읽을 수 없어'] }

  const images = {}
  if (json.images && typeof json.images === 'object') {
    for (const [id, img] of Object.entries(json.images)) {
      if (img && typeof img.dataUrl === 'string' && /^data:image\/[\w+.-]+;base64,/.test(img.dataUrl)) images[id] = img
      else warnings.push(`이미지 ${id} 데이터가 손상되어 제외했어`)
    }
  }
  // 백업에 포함되지 않은 로컬 이미지 개수
  const localIds = collectLocalImageIds(data)
  const missingImages = [...localIds].filter((id) => !images[id]).length
  return { data, images, warnings, missingImages, errors: [] }
}

export function collectLocalImageIds(data) {
  const ids = new Set()
  data.stays.forEach((s) => s.coverImage?.type === 'local' && ids.add(s.coverImage.id))
  data.rooms.forEach((r) => r.images.forEach((img) => img.type === 'local' && ids.add(img.id)))
  return ids
}
