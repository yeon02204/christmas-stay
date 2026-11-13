// 가격 계산 유틸.
// 원칙: 미입력 금액(null)은 절대 0원으로 취급하지 않는다.

import { EXTRA_KIND, RATING_CRITERIA } from './models.js'

export function formatWon(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null
  return `₩${Math.round(n).toLocaleString('ko-KR')}`
}

export function getRate(room, key) {
  return room?.rates?.[key] ?? null
}

/** 날짜별 금액이 있으면 그 값, 없으면 공통 기본값, 둘 다 없으면 null(가격 미확인) */
export function effectiveExtraPrice(extra, rate) {
  const override = rate?.extraPrices?.[extra.id]
  if (override !== undefined && override !== null) return override
  return extra.defaultPrice ?? null
}

/**
 * 선택 추가금이 포함되는지 결정한다.
 * selection: { bbq: bool, fire: bool, custom: { [extraId]: bool } }
 */
export function isExtraIncluded(extra, selection = {}) {
  if (extra.required) return true
  if (extra.kind === EXTRA_KIND.bbq) return !!selection.bbq
  if (extra.kind === EXTRA_KIND.fire) return !!selection.fire
  return !!selection.custom?.[extra.id]
}

/**
 * 총비용 = 기본 숙박비 + 필수 추가금 + 선택한 선택 추가금
 * status:
 *  - 'no-rate'        : 이 날짜 구간의 가격 정보 자체가 없음
 *  - 'no-room-price'  : 기본 숙박비 미입력 → 계산 불가
 *  - 'incomplete'     : 포함된 추가금 중 가격 미확인 항목 있음 → 확정 금액 아님
 *  - 'complete'       : 계산 완료
 */
export function calculateTotal(room, key, selection = {}) {
  const rate = getRate(room, key)
  const lines = (room?.extras ?? []).map((extra) => ({
    extra,
    price: effectiveExtraPrice(extra, rate),
    included: isExtraIncluded(extra, selection),
  }))
  const included = lines.filter((l) => l.included)
  const unknownItems = included.filter((l) => l.price === null).map((l) => l.extra.name || '이름 없는 항목')
  const extrasKnownSum = included.reduce((s, l) => s + (l.price ?? 0), 0)

  if (!rate) {
    return { status: 'no-rate', roomPrice: null, lines, unknownItems, knownSum: null, total: null }
  }
  if (rate.roomPrice === null || rate.roomPrice === undefined) {
    return { status: 'no-room-price', roomPrice: null, lines, unknownItems, knownSum: null, total: null }
  }
  const knownSum = rate.roomPrice + extrasKnownSum
  if (unknownItems.length > 0) {
    return { status: 'incomplete', roomPrice: rate.roomPrice, lines, unknownItems, knownSum, total: null }
  }
  return { status: 'complete', roomPrice: rate.roomPrice, lines, unknownItems, knownSum, total: knownSum }
}

/** 계산이 완료된 객실이 2개 이상일 때만 최저 총비용 객실 id 목록을 돌려준다. */
export function findCheapest(results) {
  const complete = results.filter((r) => r.result.status === 'complete')
  if (complete.length < 2) return []
  const min = Math.min(...complete.map((r) => r.result.total))
  return complete.filter((r) => r.result.total === min).map((r) => r.id)
}

/** 숙소의 객실 중 해당 날짜 기본 숙박비 최저값. 입력된 값이 없으면 null */
export function lowestRoomPrice(rooms, key) {
  const prices = rooms
    .map((r) => getRate(r, key)?.roomPrice)
    .filter((p) => p !== null && p !== undefined)
  return prices.length ? Math.min(...prices) : null
}

export function ratingSummary(ratings = {}) {
  const values = RATING_CRITERIA.map((c) => ratings[c.key]).filter((v) => typeof v === 'number')
  const count = values.length
  return {
    count,
    total: RATING_CRITERIA.length,
    average: count ? Math.round((values.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null,
    complete: count === RATING_CRITERIA.length,
  }
}

/** 문자열 입력 → 정수 금액. 빈 값은 null. 잘못된 값은 { error } */
export function parsePriceInput(raw) {
  const s = String(raw ?? '').replace(/[,\s₩원]/g, '')
  if (s === '') return { value: null }
  if (!/^\d+$/.test(s)) return { error: '0 이상의 숫자만 입력할 수 있어' }
  const n = Number(s)
  if (!Number.isSafeInteger(n)) return { error: '금액이 너무 커' }
  return { value: n }
}
