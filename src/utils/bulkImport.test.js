import { describe, expect, it } from 'vitest'
import { BULK_EXAMPLE, parseBulkInput, parseJsonText } from './bulkImport.js'
import { runBulkImport } from '../services/bulkImport.js'

const one = (stay) => JSON.stringify({ stays: [stay] })
const parse1 = (stay, existing) => parseBulkInput(one(stay), existing).items[0]

describe('일괄 등록: JSON 읽기', () => {
  it('```json 코드블록과 숙소 배열/단일 객체를 모두 받는다', () => {
    expect(parseBulkInput('```json\n{"stays":[{"name":"A"}]}\n```').items).toHaveLength(1)
    expect(parseBulkInput('[{"name":"A"},{"name":"B"}]').items).toHaveLength(2)
    expect(parseBulkInput('{"name":"A"}').items).toHaveLength(1)
  })

  it('문법 오류는 줄 번호와 쉼표 힌트를 알려 준다', () => {
    const r = parseJsonText('{\n  "stays": [\n    {"name": "A"},\n  ]\n}')
    expect(r.error).toMatch(/줄/)
    expect(r.error).toMatch(/쉼표/)
  })

  it('예시 JSON 은 오류 없이 읽힌다', () => {
    const r = parseBulkInput(JSON.stringify(BULK_EXAMPLE))
    expect(r.items[0].errors).toEqual([])
  })
})

describe('일괄 등록: 값 변환 규칙', () => {
  const it0 = parse1({
    name: ' 숙소 ',
    homepageUrl: 'www.example.com',
    coverImageUrl: 'https://example.com/c.jpg',
    rooms: [
      {
        name: '객실',
        baseGuests: '2명',
        maxGuests: 4,
        imageUrls: ['https://example.com/1.jpg', 'https://example.com/1.jpg', 'https://example.com/2.jpg'],
        extras: [
          { kind: 'bbq', defaultPrice: '30,000원' },
          { name: '조식', defaultPrice: null, required: true },
        ],
        rates: [
          { checkIn: '2026-12-24', checkOut: '2026-12-25', roomPrice: 250000, availability: '예약 가능', extraPrices: { 바비큐: 35000, 조식: null } },
          { checkIn: '2026-12-25', checkOut: '2026-12-26', roomPrice: '미정' },
        ],
        facilities: { 개별화장실: '있음', wifi: 'no', 스파: '확인 필요' },
        mood: { 전망: '숲뷰' },
        bookingUrl: 'https://example.com/book',
      },
    ],
  })
  const room = it0.rooms[0]

  it('숙소 기본 정보·URL 정규화', () => {
    expect(it0.errors).toEqual([])
    expect(it0.stay.name).toBe('숙소')
    expect(it0.stay.homepageUrl).toBe('https://www.example.com')
    expect(it0.stay.coverImage).toEqual({ type: 'url', url: 'https://example.com/c.jpg' })
  })

  it('사진 URL 중복 제거, 예약 링크 저장', () => {
    expect(room.images.map((i) => i.url)).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg'])
    expect(room.bookingUrl).toBe('https://example.com/book')
    expect(room.baseGuests).toBe(2)
  })

  it('미입력 금액은 null 유지 (0원으로 바꾸지 않음)', () => {
    expect(room.rates['2026-12-25_2026-12-26'].roomPrice).toBeNull()
    expect(room.extras.find((e) => e.name === '조식').defaultPrice).toBeNull()
    expect(room.extras.find((e) => e.kind === 'fire').defaultPrice).toBeNull() // 기본 불멍 항목 자동 추가
  })

  it('날짜별 추가금은 이름으로 해당 추가금에 연결되고, null 은 기본값 사용', () => {
    const bbq = room.extras.find((e) => e.kind === 'bbq')
    expect(bbq.defaultPrice).toBe(30000)
    expect(room.rates['2026-12-24_2026-12-25'].extraPrices).toEqual({ [bbq.id]: 35000 })
    expect(room.rates['2026-12-24_2026-12-25'].availability).toBe('available')
    expect(room.rates['2026-12-25_2026-12-26'].availability).toBe('unchecked')
  })

  it('시설: 적은 것만 반영, 나머지는 확인 필요', () => {
    expect(room.facilities.toilet).toBe('yes')
    expect(room.facilities.wifi).toBe('no')
    expect(room.facilities.spa).toBe('unknown')
    expect(room.facilities.heating).toBe('unknown')
    expect(room.mood.view).toBe('숲뷰')
  })

  it('JSON 에 없는 날짜의 가격은 만들지 않는다', () => {
    expect(Object.keys(room.rates)).toEqual(['2026-12-24_2026-12-25', '2026-12-25_2026-12-26'])
  })
})

describe('일괄 등록: 오류 위치 표시', () => {
  it('어느 숙소·객실·항목인지 경로로 알려 준다', () => {
    const it0 = parse1({
      name: '숙소',
      rooms: [
        { name: '객실1', rates: [{ checkIn: '2026-12-25', checkOut: '2026-12-24', roomPrice: 1 }] },
        { name: '객실2', rates: [{ checkIn: '2026-12-24', checkOut: '2026-12-25', roomPrice: -1, extraPrices: { 없는추가금: 1 } }] },
        { name: '객실3', facilities: { 수영장: '있음', 난방: '아마도' }, imageUrls: ['javascript:alert(1)'] },
        { name: '' },
      ],
    })
    const e = it0.errors.join('\n')
    expect(e).toMatch(/숙소 1 "숙소" › 객실 1 "객실1" › rates\[0\]: 체크아웃/)
    expect(e).toMatch(/객실 2 "객실2" › rates\[0\]\.roomPrice: 0 이상/)
    expect(e).toMatch(/"없는추가금" 추가금이 extras 에 없어/)
    expect(e).toMatch(/"수영장" 는 알 수 없는 시설/)
    expect(e).toMatch(/facilities\["난방"\]: "아마도"/)
    expect(e).toMatch(/imageUrls\[0\]: http/)
    expect(e).toMatch(/객실 4 › ?\.?name|객실 4\.name: 객실명이 필요해/)
  })

  it('바비큐 항목 두 개, 숫자 아닌 금액, 소수 금액은 오류', () => {
    const e = parse1({
      name: 'A',
      rooms: [{ name: 'r', extras: [{ kind: 'bbq', defaultPrice: '3만원' }, { kind: 'bbq' }], rates: [{ checkIn: '2026-12-24', checkOut: '2026-12-25', roomPrice: 1.5 }] }],
    }).errors.join('\n')
    expect(e).toMatch(/숫자로 된 금액/)
    expect(e).toMatch(/바비큐 항목은 객실당 하나/)
    expect(e).toMatch(/정수/)
  })
})

describe('일괄 등록: 중복 등록 방지', () => {
  it('이미 있는 숙소 이름(공백·대소문자 무시)은 등록 불가', () => {
    const it0 = parse1({ name: 'Star  Glamping' }, ['star glamping'])
    expect(it0.duplicate).toBe(true)
    expect(it0.errors.join()).toMatch(/중복 등록 방지/)
  })
  it('붙여넣은 목록 안의 같은 이름 숙소, 같은 숙소 안 같은 객실 이름은 등록 불가', () => {
    const r = parseBulkInput(JSON.stringify({ stays: [{ name: 'A' }, { name: ' a ' }, { name: 'B', rooms: [{ name: 'x' }, { name: 'x' }] }] }))
    expect(r.items[0].errors).toEqual([])
    expect(r.items[1].errors.join()).toMatch(/1번째 숙소와 이름이 같아/)
    expect(r.items[2].errors.join()).toMatch(/"x" 객실이 이 숙소에 두 번/)
  })
})

describe('일괄 등록: 저장과 실패 처리', () => {
  function fakeApi({ failRoom, failDelete, existing = [], authFailOn } = {}) {
    const db = { stays: new Map(existing.map((n, i) => [`old${i}`, { name: n, rooms: [] }])) }
    let seq = 0
    return {
      db,
      getState: async () => ({ stays: [...db.stays.values()].map((s) => ({ name: s.name })) }),
      saveStay: async (s) => {
        if (authFailOn === s.name) throw Object.assign(new Error('로그인이 만료됐어'), { kind: 'auth' })
        const id = `s${++seq}`
        db.stays.set(id, { name: s.name, rooms: [] })
        return { stay: { id } }
      },
      saveRoom: async (r) => {
        if (r.name === failRoom) throw Object.assign(new Error('입력값이 허용 범위를 벗어났어'), { kind: 'invalid' })
        db.stays.get(r.stayId).rooms.push(r)
        return { room: { id: `r${++seq}` } }
      },
      deleteStay: async (id) => {
        if (failDelete) throw new Error('network')
        db.stays.delete(id)
        return { removedPaths: [] }
      },
    }
  }
  const items = (text) => parseBulkInput(text).items

  it('숙소 여러 개와 객실을 저장하고, 객실 하나가 실패하면 그 숙소만 되돌린다', async () => {
    const api = fakeApi({ failRoom: 'bad' })
    const list = items(JSON.stringify({ stays: [
      { name: 'A', rooms: [{ name: 'a1' }, { name: 'a2' }] },
      { name: 'B', rooms: [{ name: 'b1' }, { name: 'bad' }] },
      { name: 'C', rooms: [{ name: 'c1' }] },
    ] }))
    const res = await runBulkImport(list, { api })
    expect(res.map((r) => r.status)).toEqual(['ok', 'failed', 'ok'])
    expect(res[1]).toMatchObject({ name: 'B', failedRoom: 'bad', rolledBack: true })
    expect([...api.db.stays.values()].map((s) => s.name)).toEqual(['A', 'C']) // B 는 남지 않음
    expect([...api.db.stays.values()][0].rooms.map((r) => r.name)).toEqual(['a1', 'a2'])
    // 새로 만들 때 id/version 을 비워서 보낸다
    expect([...api.db.stays.values()][0].rooms[0].id).toBe('')
  })

  it('되돌리기마저 실패하면 남은 숙소 id 를 알려 준다', async () => {
    const api = fakeApi({ failRoom: 'bad', failDelete: true })
    const res = await runBulkImport(items(JSON.stringify({ stays: [{ name: 'B', rooms: [{ name: 'bad' }] }] })), { api })
    expect(res[0]).toMatchObject({ status: 'failed', rolledBack: false, leftover: 's1' })
  })

  it('로그인 만료면 그 뒤 숙소는 시도하지 않는다', async () => {
    const api = fakeApi({ authFailOn: 'B' })
    const res = await runBulkImport(items(JSON.stringify({ stays: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] })), { api })
    expect(res.map((r) => r.status)).toEqual(['ok', 'failed', 'skipped'])
  })

  it('미리보기 뒤에 상대가 같은 이름을 등록했으면 저장 직전에 건너뛴다', async () => {
    const api = fakeApi({ existing: ['B'] })
    const res = await runBulkImport(items(JSON.stringify({ stays: [{ name: 'A' }, { name: 'b' }] })), { api })
    expect(res.map((r) => r.status)).toEqual(['ok', 'skipped'])
    expect(res[1].duplicate).toBe(true)
    expect(api.db.stays.size).toBe(2)
  })
})
