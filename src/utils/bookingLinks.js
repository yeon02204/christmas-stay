// 예약 링크 일괄 업데이트: JSON 의 stayName 을 기존 숙소 이름과 맞춰 보고, 저장 전에 결과를 분류한다.
// 새 숙소는 절대 만들지 않는다. 바꾸는 값은 객실의 예약 링크(rooms.booking_url) 하나뿐이다.

import { parseJsonText, stayNameKey } from './bulkImport.js'
import { isValidUrl } from './validation.js'

const NAME_KEYS = ['stayName', 'name', 'stay', '숙소명']
const URL_KEYS = ['bookingUrl', 'bookingLink', 'booking_url', 'url', 'link', '예약링크', '예약 링크']
const LIST_KEYS = ['updates', 'stays', 'items', 'bookingLinks', 'links', 'data']

const pick = (obj, keys) => {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return { key: k, value: obj[k] }
  return null
}

/** 붙여넣은 JSON → [{ line, stayName, url }] 또는 { error } */
export function parseLinkUpdates(text) {
  const parsed = parseJsonText(text)
  if (parsed.error) return { error: parsed.error }
  const v = parsed.value
  let list = Array.isArray(v) ? v : null
  if (!list && v && typeof v === 'object') {
    for (const k of LIST_KEYS) if (Array.isArray(v[k])) { list = v[k]; break }
  }
  if (!list) return { error: '예약 링크 목록을 찾지 못했어. [ { "stayName": "...", "bookingUrl": "https://..." } ] 형태로 넣어 줘' }
  if (list.length === 0) return { error: '목록이 비어 있어' }
  if (list.length > 500) return { error: `한 번에 최대 500개까지야 (지금 ${list.length}개)` }
  const entries = list.map((raw, i) => {
    const line = i + 1
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { line, stayName: '', url: '', error: '객체({...})여야 해' }
    const n = pick(raw, NAME_KEYS)
    const u = pick(raw, URL_KEYS)
    const stayName = typeof n?.value === 'string' ? n.value.trim() : ''
    const url = typeof u?.value === 'string' ? u.value.trim() : ''
    let error = null
    if (!stayName) error = 'stayName(숙소명)이 없어'
    else if (!url) error = 'bookingUrl(예약 링크)이 없어'
    else if (!isValidUrl(url) || /\s/.test(url)) error = `예약 링크가 http:// 또는 https:// 주소가 아니야 ("${url.slice(0, 80)}")`
    return { line, stayName, url, error }
  })
  return { entries }
}

/**
 * 기존 숙소와 맞춰 본다.
 * stays: [{ id, name }], rooms: [{ id, stayId, name, bookingUrl }]
 * onlyEmpty: true 면 이미 링크가 있는 객실은 그대로 둔다
 * 반환 그룹
 *  - ready      : 저장할 숙소 (stay, url, rooms: [{ room, from, to, change }])
 *  - unchanged  : 이미 모든 객실이 같은 링크 (저장할 것 없음)
 *  - noRooms    : 숙소는 찾았지만 객실이 없어 예약 링크를 저장할 곳이 없음
 *  - unmatched  : 같은 이름의 숙소가 없음 (비슷한 이름 후보 표시, 자동 수정 안 함)
 *  - ambiguous  : 같은 이름 숙소가 여럿이거나, JSON 안에서 같은 숙소에 다른 링크가 여러 개 (자동 수정 안 함)
 *  - invalid    : 이름/링크가 비었거나 잘못된 주소
 */
export function matchLinkUpdates(entries, stays, rooms, { onlyEmpty = false } = {}) {
  const byKey = new Map()
  for (const s of stays) {
    const k = stayNameKey(s.name)
    byKey.set(k, [...(byKey.get(k) || []), s])
  }
  const roomsByStay = new Map()
  for (const r of rooms) roomsByStay.set(r.stayId, [...(roomsByStay.get(r.stayId) || []), r])

  const out = { ready: [], unchanged: [], noRooms: [], unmatched: [], ambiguous: [], invalid: [] }

  // JSON 안에서 같은 숙소가 여러 번 나오는지 먼저 본다
  const valid = []
  for (const e of entries) (e.error ? out.invalid : valid).push(e)
  const groups = new Map()
  for (const e of valid) {
    const k = stayNameKey(e.stayName)
    groups.set(k, [...(groups.get(k) || []), e])
  }

  for (const [k, list] of groups) {
    const first = list[0]
    const urls = [...new Set(list.map((e) => e.url))]
    if (urls.length > 1) {
      out.ambiguous.push({ ...first, lines: list.map((e) => e.line), reason: `JSON 안에 이 숙소의 링크가 ${urls.length}개 서로 달라`, candidates: urls })
      continue
    }
    const matches = byKey.get(k) || []
    const note = list.length > 1 ? `JSON 에 ${list.length}번 들어 있음 (링크 같음, 한 번만 반영)` : null
    if (matches.length === 0) {
      out.unmatched.push({ ...first, lines: list.map((e) => e.line), suggestions: suggest(first.stayName, stays) })
      continue
    }
    if (matches.length > 1) {
      out.ambiguous.push({ ...first, lines: list.map((e) => e.line), reason: `같은 이름의 숙소가 ${matches.length}개 등록돼 있어`, candidates: matches.map((m) => m.name) })
      continue
    }
    const stay = matches[0]
    const stayRooms = roomsByStay.get(stay.id) || []
    if (stayRooms.length === 0) {
      out.noRooms.push({ ...first, lines: list.map((e) => e.line), stay })
      continue
    }
    const changes = stayRooms.map((room) => {
      const from = room.bookingUrl || ''
      const change = from !== first.url && (!onlyEmpty || from === '')
      return { room, from, to: change ? first.url : from, change, keptExisting: onlyEmpty && from !== '' && from !== first.url }
    })
    const item = { ...first, lines: list.map((e) => e.line), stay, url: first.url, rooms: changes, note }
    if (changes.some((c) => c.change)) out.ready.push(item)
    else out.unchanged.push(item)
  }
  return out
}

/** 이름이 정확히 같지 않을 때 보여 줄 후보 (자동으로 고르지 않는다) */
function suggest(name, stays) {
  const k = stayNameKey(name)
  if (k.length < 2) return []
  // 비슷한 순서: 한쪽이 다른 쪽을 포함 > 겹치는 글자가 긴 순
  return stays
    .map((s) => {
      const sk = stayNameKey(s.name)
      const run = commonRun(sk, k)
      const contains = sk.includes(k) || k.includes(sk)
      return { name: s.name, score: (contains ? 1000 : 0) + run, ok: contains || run >= Math.min(4, sk.length, k.length) }
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.name)
}

function commonRun(a, b) {
  let best = 0
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      let n = 0
      while (a[i + n] && a[i + n] === b[j + n]) n++
      if (n > best) best = n
    }
  return best
}
