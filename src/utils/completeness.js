// 숙소 정보가 얼마나 채워졌는지 점수(0~100). 홈의 '정보 많은순' 정렬에 쓴다.
// 사진이 있는지가 화면 인상에 가장 크게 영향을 줘서 가장 큰 비중을 둔다.
// 미입력 값을 0원·없음으로 취급하지 않는다: '채워졌는지'만 본다.

import { FACILITIES, MOOD_FIELDS, STAY_TYPE_LABEL } from './models.js'
import { getRate } from './price.js'

export function stayCompleteness(stay, rooms = [], key) {
  let score = 0
  const hasPhoto = !!stay.coverImage || rooms.some((r) => r.images?.length)
  if (hasPhoto) score += 40
  if (rooms.length) score += 10

  // 이 여행 날짜의 숙박비가 하나라도 입력됨
  const rates = rooms.map((r) => getRate(r, key)).filter(Boolean)
  if (rates.some((r) => r.roomPrice !== null && r.roomPrice !== undefined)) score += 15
  if (rates.some((r) => r.availability && r.availability !== 'unchecked')) score += 5

  if (stay.address?.trim()) score += 5
  if (stay.homepageUrl?.trim()) score += 3
  if (stay.region?.trim()) score += 2
  if (STAY_TYPE_LABEL[stay.stayType]) score += 2
  if (stay.memo?.trim()) score += 2

  if (rooms.length) {
    // 객실 정보는 평균으로 (객실이 많다고 점수가 부풀지 않게)
    const per = rooms.map((r) => {
      const fac = FACILITIES.filter((f) => r.facilities?.[f.key] && r.facilities[f.key] !== 'unknown').length / FACILITIES.length
      const mood = MOOD_FIELDS.some((m) => r.mood?.[m.key]?.trim()) ? 1 : 0
      return fac * 8 + (r.bookingUrl ? 4 : 0) + mood * 2 + (r.baseGuests || r.maxGuests ? 2 : 0)
    })
    score += per.reduce((a, b) => a + b, 0) / per.length
  }
  return Math.round(score)
}
