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
    { stayName: '전혀다른곳', bookingUrl: 'https://new.example.com/6' },
    { stayName: '청계산장', bookingUrl: 'https://new.example.com/1' }, // 같은 링크 중복 → 한 번만
    { stayName: 'bad', bookingUrl: 'ftp://x' },
  ])).entries

  it('정확히 같은 이름은 자동 연결, 불확실한 것은 직접 선택·후보 없음으로 분류', () => {
    const m = matchLinkUpdates(entries, stays, rooms)
    expect(m.ready.map((x) => x.stay.id)).toEqual(['s1', 's2'])
    expect(m.ready[0].reasons).toContain('숙소명 일치')
    expect(m.ready[0].note).toMatch(/2번/)
    // 같은 이름 숙소가 둘 → 직접 선택
    expect(m.review.find((x) => x.stayName === '숲속 카라반').candidates.map((c) => c.stay.id).sort()).toEqual(['s3', 's4'])
    // '청계' 는 '청계산장' 의 일부일 뿐 → 자동 연결 안 하고 후보로만
    const partial = m.review.find((x) => x.stayName === '청계')
    expect(partial.candidates.map((c) => c.stay.id)).toEqual(['s1'])
    expect(m.ready.some((x) => x.stayName === '청계')).toBe(false)
    expect(m.unmatched.map((x) => x.stayName)).toEqual(['전혀다른곳'])
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

describe('예약 링크: 이름 표기가 다른 같은 숙소', () => {
  const real = [
    { id: 'a', name: '서울 서초 글램핑 청계산장', region: '서울 서초', address: '서울 서초구 청계산로 140-94 (원지동)' },
    { id: 'b', name: '가평 아린글램핑', region: '가평', address: '' },
    { id: 'c', name: '가평 애플밸리 풀빌라&스파펜션', region: '가평', address: '' },
    { id: 'd', name: '홍천 샤이니 펜션', region: '홍천', address: '' },
    { id: 'e', name: '양평 샤이니 글램핑', region: '양평', address: '' },
    { id: 'f', name: '포천 노블글램핑', region: '포천', address: '' },
  ]
  const rr = real.map((s) => ({ id: 'r' + s.id, stayId: s.id, name: '객실', bookingUrl: s.id === 'f' ? 'https://www.yeogi.com/domestic-accommodations/67867?checkIn=2026-12-25' : '' }))
  const run = (list, opts) => matchLinkUpdates(parseLinkUpdates(JSON.stringify(list)).entries, real, rr, opts)

  it('지역·유형 단어와 띄어쓰기·특수문자를 빼고 핵심 이름이 하나만 맞으면 자동 연결 (근거 표시)', () => {
    const m = run([
      { stayName: '청계산장 글램핑', bookingUrl: 'https://x.example.com/1' },
      { stayName: '애플밸리 풀빌라 & 스파 펜션', bookingUrl: 'https://x.example.com/2' },
    ])
    expect(m.ready.map((x) => [x.stayName, x.stay.id])).toEqual([['청계산장 글램핑', 'a'], ['애플밸리 풀빌라 & 스파 펜션', 'c']])
    expect(m.ready[0].reasons[0]).toMatch(/핵심 이름 일치 \("청계산장"/)
    expect(m.ready[0].auto).toBe(true)
  })

  it('지역·띄어쓰기·특수문자만 다른 같은 이름은 자동, 괄호 속 지역은 지역 근거로', () => {
    const m = run([
      { stayName: '아린 글램핑', bookingUrl: 'https://x.example.com/3' },
      { stayName: '애플밸리 풀빌라&스파펜션 (경기 가평)', bookingUrl: 'https://x.example.com/2' },
    ])
    expect(m.ready.map((x) => x.stay.id)).toEqual(['b', 'c'])
    expect(m.ready[0].reasons).toContain('숙소명 일치 (지역·띄어쓰기·특수문자 차이만)')
    expect(m.ready[1].reasons).toContain('지역 일치 (가평)')
  })

  it('두 글자 핵심 이름만 같거나 유형 단어가 다르면 자동 연결하지 않음 (다른 업체일 수 있음)', () => {
    let m = run([{ stayName: '아린 카라반', region: '가평', bookingUrl: 'https://x.example.com/3' }])
    expect(m.ready).toHaveLength(0)
    expect(m.review[0].candidates[0].stay.id).toBe('b')
    m = run([{ stayName: '노블 리조트', bookingUrl: 'https://x.example.com/7' }])
    expect(m.ready).toHaveLength(0)
    m = run([{ stayName: '애플밸리 카라반', bookingUrl: 'https://x.example.com/8' }])
    expect(m.ready).toHaveLength(0)
    expect(m.review[0].candidates[0].conflicts.join()).toMatch(/유형 단어가 달라/)
  })

  it('핵심 이름이 같은 숙소가 여럿이면 자동 연결하지 않음, 지역이 다르면 경고', () => {
    let m = run([{ stayName: '샤이니', bookingUrl: 'https://x.example.com/4' }])
    expect(m.ready).toHaveLength(0)
    expect(m.review[0].candidates.map((c) => c.stay.id).sort()).toEqual(['d', 'e'])
    m = run([{ stayName: '샤이니 펜션', region: '양평', bookingUrl: 'https://x.example.com/4' }])
    expect(m.ready).toHaveLength(0) // 이름이 정확히 같은 '홍천 샤이니 펜션'? 아님 → 핵심 이름 같은 후보 둘
    const d = m.review[0].candidates.find((c) => c.stay.id === 'd')
    expect(d.conflicts.join()).toMatch(/지역이 달라/)
  })

  it('이름이 달라도 주소나 같은 예약 페이지가 맞으면 자동 연결', () => {
    const m = run([
      { stayName: 'Cheonggye Sanjang', address: '서울특별시 서초구 청계산로 140-94', bookingUrl: 'https://x.example.com/5' },
      { stayName: 'Noble', bookingUrl: 'https://www.yeogi.com/domestic-accommodations/67867?checkIn=2026-12-24&checkOut=2026-12-25' },
    ])
    expect(m.ready.map((x) => [x.stay.id, x.reasons[0]])).toEqual([['a', '주소 일치'], ['f', '기존 예약 링크와 같은 숙소 페이지']])
  })

  it('직접 고르면 그 숙소(id)로 연결, 연결 안 함·자동 연결 제외도 가능', () => {
    const list = [{ stayName: '아린 글램핑', bookingUrl: 'https://x.example.com/3' }, { stayName: '청계산장', bookingUrl: 'https://x.example.com/1' }]
    const key = parseLinkUpdates(JSON.stringify(list)).entries.map((e) => e.stayName.replace(/\s+/g, '').toLowerCase())
    let m = run(list, { choices: { [key[0]]: 'b' } })
    expect(m.ready.map((x) => [x.stay.id, x.auto])).toEqual([['b', false], ['a', true]])
    expect(m.ready[0].reasons[0]).toBe('직접 선택')
    m = run(list, { choices: { [key[0]]: '' }, excluded: new Set([key[1]]) })
    expect(m.ready).toHaveLength(0)
    expect(m.review[0].decided).toBe('skip')
    expect(m.excluded.map((x) => x.stay.id)).toEqual(['a'])
  })

  it('서로 다른 이름 두 개가 같은 숙소로 연결되는데 링크가 다르면 둘 다 건너뜀', () => {
    const m = run([
      { stayName: '청계산장', bookingUrl: 'https://x.example.com/1' },
      { stayName: '청계산장 글램핑', bookingUrl: 'https://x.example.com/9' },
    ])
    expect(m.ready).toHaveLength(0)
    expect(m.ambiguous).toHaveLength(2)
  })

  it('이미 같은 링크면 그대로 둠', () => {
    const m = run([{ stayName: '포천 노블글램핑', bookingUrl: 'https://www.yeogi.com/domestic-accommodations/67867?checkIn=2026-12-25' }])
    expect(m.unchanged.map((x) => x.stay.id)).toEqual(['f'])
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
