// 예약 링크 일괄 업데이트 실행. 숙소마다 set_stay_booking_link RPC 를 한 번씩 부른다.
// 이 RPC 는 객실의 예약 링크만 바꾸고, 숙소 하나의 객실들은 한 트랜잭션으로 함께 바뀐다.
// 한 숙소가 실패해도 나머지는 계속 진행한다 (로그인 만료·권한 문제면 멈춤).

import { api as defaultApi } from './api.js'

const STOP_KINDS = new Set(['auth', 'forbidden'])

/**
 * @param {Array<{ stay, url, stayName }>} items  matchLinkUpdates 의 ready
 * @returns {Promise<Array<{ stayId, name, status: 'ok'|'failed'|'skipped', updated?, error? }>>}
 */
export async function runBookingLinkUpdate(items, { api = defaultApi, onlyEmpty = false, onProgress } = {}) {
  const results = []
  let stopped = null
  for (let i = 0; i < items.length; i++) {
    const { stay, url } = items[i]
    if (stopped) {
      results.push({ stayId: stay.id, name: stay.name, status: 'skipped', error: stopped })
      continue
    }
    onProgress?.({ index: i, total: items.length, name: stay.name })
    try {
      const res = await api.setStayBookingLink(stay.id, url, onlyEmpty)
      results.push({ stayId: stay.id, name: stay.name, status: 'ok', updated: res?.updated ?? 0 })
    } catch (err) {
      results.push({ stayId: stay.id, name: stay.name, status: 'failed', error: err?.message || String(err) })
      if (STOP_KINDS.has(err?.kind)) stopped = '로그인/권한 문제로 중단돼서 시도하지 않았어'
    }
  }
  return results
}
