import { describe, expect, it } from 'vitest'
import { matchLinkUpdates, parseLinkUpdates } from './bookingLinks.js'
import { runBookingLinkUpdate } from '../services/bookingLinks.js'

const stays = [
  { id: 's1', name: '청계산장' },
  { id: 's2', name: '별빛 글램핑' },
  { id: 's3', name: '숲속 카라반' },
  { id: 's4', name: '숲속 카라반 ' }, // 공백만 다른 같은 이름 → 중복
  { id: 's5', name: '객실없는숙소' },
]
const rooms = [
  { id: 'r1', stayId: 's1', name: 'A동', bookingUrl: '' },
  { id: 'r2', stayId: 's2', name: '돔1', bookingUrl: 'https://old.example.com/a' },
  { id: 'r3', stayId: 's2', name: '돔2', bookingUrl: '' },
  { id: 'r4', stayId: 's3', name: 'c', bookingUrl: '' },
]

describe('예약 링크: JSON 읽기', () => {
  it('배열 / { updates } / { stays } 와 여러 키 이름을 받는다', () => {
    const a = parseLinkUpdates('[{"stayName":"청계산장","bookingUrl":"https://a.example.com"}]')
    const b = parseLinkUpdates('{"updates":[{"name":"청계산장","url":"https://a.example.com"}]}')
    const c = parseLinkUpdates('```json\n{"stays":[{"숙소명":"청계산장","예약링크":"https://a.example.com"}]}\n```')
    for (const r of [a, b, c]) expect(r.entries[0]).toMatchObject({ stayName: '청계산장', url: 'https://a.example.com', error: null })
  })
  it('이름·링크 누락, 잘못된 주소는 항목별 오류', () => {
    const { entries } = parseLinkUpdates('[{"bookingUrl":"https://a.example.com"},{"stayName":"x"},{"stayName":"y","bookingUrl":"javascript:alert(1)"}]')
    expect(entries.map((e) => e.error)).toEqual([expect.stringMatching(/stayName/), expect.stringMatching(/bookingUrl/), expect.stringMatching(/http/)])
  })
})

describe('예약 링크: 매칭', () => {
  const entries = parseLinkUpdates(JSON.stringify([
    { stayName: '청계산장', bookingUrl: 'https://new.example.com/1' },
    { stayName: '별빛글램핑', bookingUrl: 'https://new.example.com/2' }, // 공백 차이 허용
    { stayName: '숲속 카라반', bookingUrl: 'https://new.example.com/3' }, // 등록된 숙소가 2개 → 중복
    { stayName: '청계', bookingUrl: 'https://new.example.com/4' }, // 이름 불일치 → 후보만
    { stayName: '객실없는숙소', bookingUrl: 'https://new.example.com/5' },
    { stayName: '없는숙소', bookingUrl: 'https://new.example.com/6' },
    { stayName: '청계산장', bookingUrl: 'https://new.example.com/1' }, // 같은 링크 중복 → 한 번만
    { stayName: 'bad', bookingUrl: 'ftp://x' },
  ])).entries

  it('정확히 같은 이름만 업데이트, 나머지는 분류해서 건너뜀', () => {
    const m = matchLinkUpdates(entries, stays, rooms)
    expect(m.ready.map((x) => x.stay.id)).toEqual(['s1', 's2'])
    expect(m.ready[0].note).toMatch(/2번/)
    expect(m.ambiguous.map((x) => x.stayName)).toEqual(['숲속 카라반'])
    expect(m.unmatched.map((x) => x.stayName)).toEqual(['청계', '없는숙소'])
    expect(m.unmatched[0].suggestions).toEqual(['청계산장'])
    expect(m.noRooms.map((x) => x.stay.id)).toEqual(['s5'])
    expect(m.invalid).toHaveLength(1)
  })

  it('여러 객실 숙소는 모든 객실에 같은 링크, onlyEmpty 면 기존 링크 유지', () => {
    const all = matchLinkUpdates(entries, stays, rooms).ready.find((x) => x.stay.id === 's2')
    expect(all.rooms.map((r) => [r.room.id, r.change, r.to])).toEqual([
      ['r2', true, 'https://new.example.com/2'],
      ['r3', true, 'https://new.example.com/2'],
    ])
    const keep = matchLinkUpdates(entries, stays, rooms, { onlyEmpty: true }).ready.find((x) => x.stay.id === 's2')
    expect(keep.rooms.map((r) => [r.room.id, r.change, r.to])).toEqual([
      ['r2', false, 'https://old.example.com/a'],
      ['r3', true, 'https://new.example.com/2'],
    ])
  })

  it('JSON 안에서 같은 숙소에 다른 링크가 둘이면 중복으로 건너뜀', () => {
    const e = parseLinkUpdates(JSON.stringify([
      { stayName: '청계산장', bookingUrl: 'https://a.example.com' },
      { stayName: '청계산장', bookingUrl: 'https://b.example.com' },
    ])).entries
    const m = matchLinkUpdates(e, stays, rooms)
    expect(m.ready).toHaveLength(0)
    expect(m.ambiguous[0].reason).toMatch(/2개 서로 달라/)
  })

  it('이미 같은 링크면 저장할 것 없음', () => {
    const e = parseLinkUpdates('[{"stayName":"숲속카라반X","bookingUrl":"https://x.example.com"}]').entries
    const m = matchLinkUpdates(e, [{ id: 's9', name: '숲속카라반X' }], [{ id: 'r9', stayId: 's9', name: 'r', bookingUrl: 'https://x.example.com' }])
    expect(m.unchanged).toHaveLength(1)
    expect(m.ready).toHaveLength(0)
  })
})

describe('예약 링크: 저장 실행', () => {
  it('숙소별로 호출하고 성공/실패를 센다. 로그인 만료면 멈춘다', async () => {
    const calls = []
    const api = {
      setStayBookingLink: async (id, url, onlyEmpty) => {
        calls.push([id, url, onlyEmpty])
        if (id === 'b') throw Object.assign(new Error('입력값 오류'), { kind: 'invalid' })
        if (id === 'c') throw Object.assign(new Error('로그인이 만료됐어'), { kind: 'auth' })
        return { rooms: 2, updated: 2 }
      },
    }
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ stay: { id, name: id }, url: `https://${id}.example.com` }))
    const res = await runBookingLinkUpdate(items, { api, onlyEmpty: true })
    expect(res.map((r) => r.status)).toEqual(['ok', 'failed', 'failed', 'skipped'])
    expect(res[0].updated).toBe(2)
    expect(calls.map((c) => c[0])).toEqual(['a', 'b', 'c'])
    expect(calls[0][2]).toBe(true)
  })
})
