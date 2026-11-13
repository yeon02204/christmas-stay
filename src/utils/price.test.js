import { describe, expect, it } from 'vitest'
import { calculateTotal, findCheapest, formatWon, lowestRoomPrice, parsePriceInput, ratingSummary } from './price.js'
import { normalizeData, validateBackup } from './validation.js'

const KEY = '2026-12-24_2026-12-25'
const room = (rate, extras) => ({
  extras: extras ?? [
    { id: 'b', kind: 'bbq', name: '바비큐', defaultPrice: 30000, required: false },
    { id: 'f', kind: 'fire', name: '불멍', defaultPrice: null, required: false },
    { id: 'c', kind: 'custom', name: '인원추가', defaultPrice: 20000, required: true },
  ],
  rates: rate === undefined ? {} : { [KEY]: rate },
})

describe('총비용 계산', () => {
  it('기본 + 필수 + 선택한 추가금', () => {
    const r = calculateTotal(room({ roomPrice: 200000, extraPrices: {} }), KEY, { bbq: true })
    expect(r.status).toBe('complete')
    expect(r.total).toBe(250000)
  })
  it('날짜별 추가금이 공통 기본값보다 우선', () => {
    const r = calculateTotal(room({ roomPrice: 200000, extraPrices: { b: 35000 } }), KEY, { bbq: true })
    expect(r.total).toBe(255000)
  })
  it('가격 미확인 추가금을 선택하면 0원으로 치지 않고 incomplete', () => {
    const r = calculateTotal(room({ roomPrice: 200000, extraPrices: {} }), KEY, { fire: true })
    expect(r.status).toBe('incomplete')
    expect(r.total).toBeNull()
    expect(r.unknownItems).toEqual(['불멍'])
  })
  it('기본 숙박비 미입력 → 계산 불가', () => {
    expect(calculateTotal(room({ roomPrice: null, extraPrices: {} }), KEY, {}).status).toBe('no-room-price')
  })
  it('해당 날짜 정보 없음 → 다른 날짜 가격을 가져오지 않음', () => {
    const r = room(undefined)
    r.rates['2026-12-25_2026-12-26'] = { roomPrice: 100000, extraPrices: {} }
    expect(calculateTotal(r, KEY, {}).status).toBe('no-rate')
  })
  it('최저가는 계산 완료 객실이 2개 이상일 때만', () => {
    const ok = (t) => ({ result: { status: 'complete', total: t } })
    expect(findCheapest([{ id: 'a', ...ok(1) }])).toEqual([])
    expect(findCheapest([{ id: 'a', ...ok(2) }, { id: 'b', ...ok(1) }, { id: 'c', result: { status: 'incomplete', total: null } }])).toEqual(['b'])
  })
  it('미입력 가격은 숙소 최저가에서 제외', () => {
    expect(lowestRoomPrice([room({ roomPrice: null, extraPrices: {} }), room(undefined)], KEY)).toBeNull()
    expect(lowestRoomPrice([room({ roomPrice: 90000, extraPrices: {} }), room({ roomPrice: null, extraPrices: {} })], KEY)).toBe(90000)
  })
})

describe('입력·표시', () => {
  it('원화 표기', () => expect(formatWon(1234567)).toBe('₩1,234,567'))
  it('금액 입력 검증', () => {
    expect(parsePriceInput('')).toEqual({ value: null })
    expect(parsePriceInput('12,000')).toEqual({ value: 12000 })
    expect(parsePriceInput('-5').error).toBeTruthy()
    expect(parsePriceInput('1.5').error).toBeTruthy()
  })
  it('평가 요약: 평가한 항목만 평균', () => {
    expect(ratingSummary({ price: 4, location: 2 })).toMatchObject({ count: 2, average: 3, complete: false })
    expect(ratingSummary({})).toMatchObject({ count: 0, average: null })
  })
})

describe('백업 검증', () => {
  it('다른 앱 파일 거부', () => expect(validateBackup({ app: 'x' }).errors.length).toBe(1))
  it('구조 오류 보고', () => expect(normalizeData({ stays: 'x', rooms: [] }).errors.length).toBeGreaterThan(0))
  it('고아 객실 / 없는 찜 정리', () => {
    const { data, errors } = normalizeData({
      stays: [{ id: 's', name: 'A' }],
      rooms: [{ id: 'r', stayId: 's', name: 'R' }],
      favorites: [{ roomId: 'r' }, { roomId: 'zz' }],
      compare: ['r', 'zz'],
    })
    expect(errors).toEqual([])
    expect(data.favorites).toHaveLength(1)
    expect(data.compare).toEqual(['r'])
  })
})
