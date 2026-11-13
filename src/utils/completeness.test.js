import { describe, expect, it } from 'vitest'
import { stayCompleteness } from './completeness.js'

const KEY = '2026-12-25_2026-12-26'
const room = (over = {}) => ({ images: [], rates: {}, facilities: {}, mood: {}, bookingUrl: '', baseGuests: null, maxGuests: null, ...over })

describe('정보 많은순 점수', () => {
  it('사진이 있으면 정보가 조금 더 많은 사진 없는 숙소보다 위', () => {
    const withPhoto = stayCompleteness({ name: 'a', coverImage: { type: 'url', url: 'https://x.example.com/a.jpg' } }, [room()], KEY)
    const noPhoto = stayCompleteness({ name: 'b', address: '주소', homepageUrl: 'https://b.example.com', region: '가평', memo: 'm' },
      [room({ rates: { [KEY]: { roomPrice: 100000, availability: 'available' } }, bookingUrl: 'https://b.example.com/book' })], KEY)
    expect(withPhoto).toBeGreaterThan(noPhoto)
  })
  it('객실 사진도 사진으로 친다, 미입력 가격은 점수 없음', () => {
    const a = stayCompleteness({ name: 'a' }, [room({ images: [{ type: 'url', url: 'https://x.example.com/1.jpg' }] })], KEY)
    const b = stayCompleteness({ name: 'b' }, [room({ rates: { [KEY]: { roomPrice: null } } })], KEY)
    expect(a).toBeGreaterThan(b)
    expect(b).toBe(10) // 객실만 있음
  })
  it('빈 숙소는 0, 다 채운 숙소는 100 근처', () => {
    expect(stayCompleteness({ name: 'x' }, [], KEY)).toBe(0)
    const full = stayCompleteness(
      { name: 'f', coverImage: { type: 'url', url: 'https://x.example.com/c.jpg' }, address: 'a', homepageUrl: 'h', region: 'r', stayType: 'glamping', memo: 'm' },
      [room({ rates: { [KEY]: { roomPrice: 1, availability: 'available' } }, bookingUrl: 'u', baseGuests: 2, mood: { view: '숲' },
        facilities: { toilet: 'yes', shower: 'yes', heating: 'yes', hotWater: 'yes', bbq: 'no', cooking: 'yes', fridge: 'yes', microwave: 'no', cookware: 'yes', parking: 'yes', wifi: 'yes', fire: 'no', spa: 'no', projector: 'no' } })],
      KEY,
    )
    expect(full).toBe(100)
  })
})
