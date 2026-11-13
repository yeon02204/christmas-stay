// 데이터 모델 정의와 기본값 생성기.
// 모든 "미입력" 값은 null 또는 빈 문자열로 둔다. 임의의 기본 수치를 채우지 않는다.

export const SCHEMA_VERSION = 1

export const DEFAULT_TRIP = { checkIn: '2026-12-24', checkOut: '2026-12-25' }

export const FACILITIES = [
  { key: 'toilet', label: '개별 화장실' },
  { key: 'shower', label: '개별 샤워실' },
  { key: 'heating', label: '난방' },
  { key: 'hotWater', label: '온수' },
  { key: 'bbq', label: '개별 바비큐' },
  { key: 'cooking', label: '취사 가능' },
  { key: 'fridge', label: '냉장고' },
  { key: 'microwave', label: '전자레인지' },
  { key: 'cookware', label: '조리도구' },
  { key: 'parking', label: '주차' },
  { key: 'wifi', label: '와이파이' },
  { key: 'fire', label: '불멍' },
  { key: 'spa', label: '스파' },
  { key: 'projector', label: '빔프로젝터' },
]

export const FACILITY_STATUS = {
  yes: '있음',
  no: '없음',
  unknown: '확인 필요',
}

export const MOOD_FIELDS = [
  { key: 'interior', label: '인테리어', placeholder: '예: 우드톤, 아늑한 조명' },
  { key: 'view', label: '전망', placeholder: '예: 숲뷰, 계곡 보임' },
  { key: 'privacy', label: '프라이버시', placeholder: '예: 옆 텐트와 거리 여유' },
  { key: 'christmas', label: '크리스마스 분위기', placeholder: '예: 트리, 전구 장식 있음' },
]

export const RATING_CRITERIA = [
  { key: 'price', label: '가격 및 가성비' },
  { key: 'location', label: '위치 및 접근성' },
  { key: 'facility', label: '시설 및 편의성' },
  { key: 'mood', label: '분위기 및 감성' },
  { key: 'terms', label: '이용 조건' },
]

export const AVAILABILITY = {
  unchecked: '확인 전',
  available: '예약 가능',
  unavailable: '예약 불가',
}

export const EXTRA_KIND = { bbq: 'bbq', fire: 'fire', custom: 'custom' }

export function createId(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${rand}`
}

// JSON 백업 형식(가져오기/내보내기 공통)의 빈 데이터
export function createEmptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    stays: [],
    rooms: [], // 백업에서는 room.ratings 에 "내 평가"를 함께 담는다
    favorites: [], // [{ roomId, memo, addedAt }] — 배열 순서 = 최종 후보 우선순위
    compare: [], // [roomId] 최대 3개
    compareOptions: { bbq: false, fire: false, custom: {} }, // custom: { [roomId]: { [extraId]: true } }
    trip: { ...DEFAULT_TRIP },
  }
}

export const EMPTY_RATINGS = Object.freeze({ price: null, location: null, facility: null, mood: null, terms: null })

export function createEmptyStay() {
  return {
    id: '',
    name: '',
    region: '',
    address: '',
    homepageUrl: '',
    version: null,
    coverImage: null, // ImageRef | null
    memo: '',
    createdAt: '',
    updatedAt: '',
  }
}

export function createDefaultExtras() {
  return [
    { id: 'bbq', kind: EXTRA_KIND.bbq, name: '바비큐', defaultPrice: null, required: false },
    { id: 'fire', kind: EXTRA_KIND.fire, name: '불멍', defaultPrice: null, required: false },
  ]
}

export function createEmptyRate() {
  return {
    roomPrice: null, // 이 날짜 구간의 기본 숙박비 (null = 미입력)
    extraPrices: {}, // { [extraId]: number } — 이 날짜에만 다른 추가금. 없으면 공통 기본값 사용
    availability: 'unchecked',
    checkedAt: '', // 예약 가능 여부 확인일 (YYYY-MM-DD)
  }
}

export function createEmptyRoom(stayId = '') {
  return {
    id: '',
    stayId,
    version: null,
    name: '',
    images: [], // ImageRef[]
    baseGuests: null,
    maxGuests: null,
    size: '',
    bedType: '',
    description: '',
    extras: createDefaultExtras(),
    rates: {}, // { [rangeKey]: Rate }
    facilities: Object.fromEntries(FACILITIES.map((f) => [f.key, 'unknown'])),
    mood: Object.fromEntries(MOOD_FIELDS.map((m) => [m.key, ''])),
    checkIn: '',
    checkOut: '',
    bookingUrl: '',
    cancelPolicy: '',
    notes: '',
    pros: '',
    cons: '',
    createdAt: '',
    updatedAt: '',
  }
}

// ImageRef: { type: 'url', url } | { type: 'storage', path }   (Supabase Storage)
//           { type: 'local', id }  ← 이전 localStorage/IndexedDB 백업에서만 사용 (가져올 때 Storage 로 업로드)
export function imageRefKey(ref) {
  if (!ref) return ''
  if (ref.type === 'storage') return `storage:${ref.path}`
  if (ref.type === 'local') return `local:${ref.id}`
  return `url:${ref.url}`
}
