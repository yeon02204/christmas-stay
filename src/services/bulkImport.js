// 숙소 일괄 등록 실행. DB 구조·RLS 를 바꾸지 않고 기존 RPC(save_stay, save_room, delete_stay)만 쓴다.
//
// 숙소 하나 = 숙소 저장 → 객실들 저장. 객실 저장 중 하나라도 실패하면
// 방금 만든 숙소를 delete_stay 로 지워서(객실·가격·추가금은 FK cascade) 반쯤 등록된 숙소가 남지 않게 한다.
// 숙소끼리는 서로 독립이라, 한 숙소가 실패해도 다음 숙소는 계속 진행한다.
// 단, 로그인 만료·권한 없음이면 나머지도 모두 실패할 테니 거기서 멈춘다.

import { api as defaultApi } from './api.js'
import { stayNameKey } from '../utils/bulkImport.js'

const STOP_KINDS = new Set(['auth', 'forbidden'])
const DUPLICATE_MSG = '같은 이름의 숙소가 이미 있어서 건너뛰었어 (중복 등록 방지)'

/**
 * @param {Array<{ stay, rooms }>} items   parseBulkInput 결과 중 등록할 것
 * @param {{ api?, onProgress? }} opts
 * @returns {Promise<Array<{ name, status: 'ok'|'failed'|'skipped', stayId?, rooms?, error?, failedRoom?, rolledBack?, leftover? }>>}
 */
export async function runBulkImport(items, { api = defaultApi, onProgress } = {}) {
  const results = []
  let stopped = null
  // 중복 등록 방지: 미리보기 이후에 상대가 같은 숙소를 등록했을 수도 있으니 저장 직전에 최신 목록을 다시 읽는다
  const existing = new Set()
  try {
    const fresh = await api.getState()
    for (const s of fresh?.stays ?? []) existing.add(stayNameKey(s.name))
  } catch (err) {
    return items.map(({ stay }) => ({ name: stay.name, status: 'skipped', error: `최신 숙소 목록을 확인하지 못해서 시작하지 않았어: ${err?.message || err}` }))
  }
  for (let i = 0; i < items.length; i++) {
    const { stay, rooms } = items[i]
    const name = stay.name
    if (stopped) {
      results.push({ name, status: 'skipped', error: stopped })
      continue
    }
    if (existing.has(stayNameKey(name))) {
      results.push({ name, status: 'skipped', error: DUPLICATE_MSG, duplicate: true })
      continue
    }
    onProgress?.({ index: i, total: items.length, name, step: '숙소 저장' })
    let stayId = null
    let failedRoom = null
    try {
      const res = await api.saveStay({ ...stay, id: '', version: null })
      stayId = res.stay.id
      for (let r = 0; r < rooms.length; r++) {
        failedRoom = rooms[r].name
        onProgress?.({ index: i, total: items.length, name, step: `객실 ${r + 1}/${rooms.length} 저장` })
        await api.saveRoom({ ...rooms[r], id: '', version: null, stayId })
      }
      existing.add(stayNameKey(name))
      results.push({ name, status: 'ok', stayId, rooms: rooms.length })
    } catch (err) {
      const result = { name, status: 'failed', error: err?.message || String(err), failedRoom: stayId ? failedRoom : null }
      if (stayId) {
        // 되돌리기: 이 숙소와 이미 저장된 객실을 지운다
        try {
          await api.deleteStay(stayId)
          result.rolledBack = true
        } catch {
          result.rolledBack = false
          result.leftover = stayId // 지우지 못함 → 화면에서 직접 지우도록 안내
        }
      } else {
        result.rolledBack = true // 아무것도 저장되지 않음
      }
      results.push(result)
      if (STOP_KINDS.has(err?.kind)) stopped = '로그인/권한 문제로 중단돼서 시도하지 않았어'
    }
  }
  return results
}
