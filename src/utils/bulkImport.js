// 숙소 일괄 등록: 붙여넣은 JSON 을 읽어 save_stay / save_room 에 보낼 형태로 바꾸고 검사한다.
// 원칙 (CLAUDE.md)
//  · 미입력 금액은 null 로 둔다. 0원으로 바꾸지 않는다.
//  · 시설 정보가 없으면 '확인 필요(unknown)'. '없음'으로 채우지 않는다.
//  · 날짜별 가격은 JSON 에 적힌 날짜 구간에만 넣는다. 다른 날짜로 복사하지 않는다.
//  · DB 제약조건과 같은 기준으로 미리 검사해서, 저장 도중 실패하는 일을 줄인다.

import { createDefaultExtras, createEmptyRoom, createEmptyStay, FACILITIES, MOOD_FIELDS, STAY_TYPES } from './models.js'
import { isIsoDate, nightsBetween } from './date.js'
import { parsePriceInput } from './price.js'
import { isValidUrl, normalizeUrlInput } from './validation.js'

export const BULK_LIMITS = { stays: 50, roomsPerStay: 30, imagesPerRoom: 30, ratesPerRoom: 60, extrasPerRoom: 20 }

// DB 컬럼 길이 제한 (supabase/migrations/20261113000000_init.sql 과 같게 유지)
const MAX = {
  stayName: 100, region: 50, address: 300, memo: 5000,
  roomName: 100, size: 50, bedType: 100, description: 5000, mood: 500, time: 20,
  cancelPolicy: 5000, notes: 5000, extraName: 50, path: 300,
}

const STAY_KEYS = new Set(['name', 'stayType', 'type', 'region', 'address', 'homepageUrl', 'coverImageUrl', 'memo', 'rooms'])
const ROOM_KEYS = new Set([
  'name', 'baseGuests', 'maxGuests', 'size', 'bedType', 'description', 'imageUrls', 'extras', 'rates',
  'facilities', 'mood', 'checkInTime', 'checkOutTime', 'checkIn', 'checkOut', 'bookingUrl', 'cancelPolicy', 'notes',
])
const EXTRA_KEYS = new Set(['id', 'kind', 'name', 'defaultPrice', 'required'])
const RATE_KEYS = new Set(['checkIn', 'checkOut', 'roomPrice', 'availability', 'checkedAt', 'extraPrices'])

const squash = (s) => String(s).replace(/\s+/g, '').toLowerCase()
/** 숙소 중복 판단 기준: 이름에서 공백을 빼고 대소문자를 무시한다 */
export const stayNameKey = squash

const FACILITY_VALUE = new Map([
  ...['yes', '있음', '있어', 'o', '가능', 'true'].map((v) => [v, 'yes']),
  ...['no', '없음', '없어', 'x', '불가', '불가능', 'false'].map((v) => [v, 'no']),
  ...['unknown', '확인필요', '미확인', '모름', '?', ''].map((v) => [v, 'unknown']),
])
const AVAILABILITY_VALUE = new Map([
  ...['available', '예약가능', '가능'].map((v) => [v, 'available']),
  ...['unavailable', '예약불가', '불가', '마감', '매진'].map((v) => [v, 'unavailable']),
  ...['unchecked', '확인전', '미확인', '확인필요', ''].map((v) => [v, 'unchecked']),
])
// 숙소 유형: 영문 키 또는 한글 이름 (공백·가운뎃점 무시). 빈 값 = 미분류
const STAY_TYPE_VALUE = new Map([
  ['', ''],
  ...STAY_TYPES.flatMap((t) => [[t.key, t.key], [squash(t.label), t.key]]),
  ...['호텔', '리조트', 'hotel·resort'].map((v) => [squash(v), 'hotel']),
  ...['캠핑장', '오토캠핑'].map((v) => [squash(v), 'camping']),
])
const EXTRA_KIND_VALUE = new Map([
  ...['bbq', '바비큐'].map((v) => [v, 'bbq']),
  ...['fire', '불멍'].map((v) => [v, 'fire']),
  ...['custom', '기타'].map((v) => [v, 'custom']),
])
// 시설 키: 영문 키 또는 화면에 보이는 한글 이름 (공백 무시)
const FACILITY_KEY = new Map(FACILITIES.flatMap((f) => [[squash(f.key), f.key], [squash(f.label), f.key]]))
const MOOD_KEY = new Map(MOOD_FIELDS.flatMap((m) => [[squash(m.key), m.key], [squash(m.label), m.key]]))
const NULL_PRICE_WORDS = new Set(['미정', '문의', '확인필요', '미입력', '모름'])

/** ChatGPT 답변처럼 ```json … ``` 으로 감싼 경우도 받아 준다 */
export function stripCodeFence(text) {
  const t = String(text ?? '').trim()
  const m = t.match(/^```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/)
  return m ? m[1].trim() : t
}

function lineCol(text, pos) {
  const before = text.slice(0, pos)
  const line = before.split('\n').length
  return { line, col: pos - before.lastIndexOf('\n') }
}

/** JSON 문법 오류를 "몇째 줄 몇째 칸" 으로 알려 준다 */
export function parseJsonText(text) {
  const src = stripCodeFence(text)
  if (!src) return { error: 'JSON 을 붙여넣어 줘' }
  try {
    return { value: JSON.parse(src) }
  } catch (e) {
    const msg = String(e.message || '')
    let pos = msg.match(/position (\d+)/)?.[1]
    if (pos === undefined) {
      // 크롬/Node 형식: Unexpected token ']', ..."주변 글자"... is not valid JSON → 주변 글자로 위치를 찾는다
      const m = msg.match(/^Unexpected token '(.+?)', (\.\.\.)?"([\s\S]*)"(?:\.\.\.)? is not valid JSON$/)
      if (m) {
        const snippet = m[3]
        const at = src.indexOf(snippet)
        if (at >= 0) pos = at + (m[2] ? Math.min(10, snippet.length) : Math.max(0, snippet.indexOf(m[1])))
      }
    }
    let where = ''
    if (pos !== undefined) {
      const { line, col } = lineCol(src, Number(pos))
      where = `${line}번째 줄 ${col}번째 칸 근처`
    } else {
      const lc = msg.match(/line (\d+) column (\d+)/)
      if (lc) where = `${lc[1]}번째 줄 ${lc[2]}번째 칸 근처`
    }
    const hint = /,\s*[}\]]/.test(src) ? ' (마지막 항목 뒤의 쉼표를 지워 봐)' : ''
    return { error: `JSON 형식이 올바르지 않아${where ? `: ${where}` : ''}${hint}` }
  }
}

// ───────────── 값 변환기: { value } 또는 { error } ─────────────

function text(v, max, label) {
  if (v === undefined || v === null) return { value: '' }
  if (typeof v === 'number') v = String(v)
  if (typeof v !== 'string') return { error: `${label}: 글자로 입력해 줘` }
  const t = v.trim()
  if (t.length > max) return { error: `${label}: ${max}자 이하로 줄여 줘 (지금 ${t.length}자)` }
  return { value: t }
}

function price(v, label) {
  if (v === undefined || v === null) return { value: null }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return { error: `${label}: 0 이상의 금액이어야 해` }
    if (!Number.isInteger(v)) return { error: `${label}: 원 단위 정수로 입력해 줘 (${v})` }
    if (v > 2147483647) return { error: `${label}: 금액이 너무 커` }
    return { value: v }
  }
  if (typeof v === 'string') {
    if (NULL_PRICE_WORDS.has(squash(v))) return { value: null }
    const r = parsePriceInput(v)
    if (r.error) return { error: `${label}: 숫자로 된 금액이어야 해 ("${v}")` }
    if (r.value !== null && r.value > 2147483647) return { error: `${label}: 금액이 너무 커` }
    return { value: r.value }
  }
  return { error: `${label}: 금액은 숫자로 입력해 줘` }
}

function guests(v, label) {
  if (v === undefined || v === null || v === '') return { value: null }
  const n = typeof v === 'string' ? Number(v.replace(/\s|명|인/g, '')) : v
  if (!Number.isInteger(n) || n < 1 || n > 99) return { error: `${label}: 1~99 사이 정수여야 해 (${JSON.stringify(v)})` }
  return { value: n }
}

function url(v, label, { image = false } = {}) {
  if (v === undefined || v === null || v === '') return { value: '' }
  if (typeof v !== 'string') return { error: `${label}: 주소는 글자로 입력해 줘` }
  const u = image ? v.trim() : normalizeUrlInput(v)
  if (!isValidUrl(u) || /\s/.test(u)) return { error: `${label}: http:// 또는 https:// 로 시작하는 주소여야 해 ("${v}")` }
  return { value: u }
}

function mapped(map, v, label, allowed) {
  if (v === undefined || v === null) return { value: map.get('') ?? null }
  if (typeof v === 'boolean') v = String(v)
  if (typeof v !== 'string') return { error: `${label}: ${allowed} 중 하나로 입력해 줘` }
  const hit = map.get(squash(v))
  if (hit === undefined) return { error: `${label}: "${v}" 는 알 수 없는 값이야 (${allowed})` }
  return { value: hit }
}

function unknownKeys(obj, allowed, label, warnings) {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) warnings.push(`${label}: "${k}" 항목은 지원하지 않아서 무시했어`)
}

// ───────────── 객실 ─────────────

function parseExtras(raw, ctx) {
  const { errors, warnings, path } = ctx
  const extras = []
  const refs = new Map() // extraPrices 에서 쓸 이름 → 임시 id
  if (raw !== undefined && !Array.isArray(raw)) {
    errors.push(`${path} › extras: 배열([...])이어야 해`)
    return { extras: createDefaultExtras(), refs: defaultRefs() }
  }
  const list = raw ?? []
  if (list.length > BULK_LIMITS.extrasPerRoom) errors.push(`${path} › extras: 최대 ${BULK_LIMITS.extrasPerRoom}개까지야`)
  list.slice(0, BULK_LIMITS.extrasPerRoom).forEach((e, i) => {
    const p = `${path} › extras[${i}]`
    if (!e || typeof e !== 'object' || Array.isArray(e)) return errors.push(`${p}: 객체({...})여야 해`)
    unknownKeys(e, EXTRA_KEYS, p, warnings)
    const kind = mapped(EXTRA_KIND_VALUE, e.kind ?? 'custom', `${p}.kind`, 'bbq / fire / custom')
    const name = text(e.name ?? (kind.value === 'bbq' ? '바비큐' : kind.value === 'fire' ? '불멍' : ''), MAX.extraName, `${p}.name`)
    const dp = price(e.defaultPrice, `${p}.defaultPrice`)
    for (const r of [kind, name, dp]) if (r.error) errors.push(r.error)
    if (!name.error && !name.value) errors.push(`${p}.name: 추가금 이름이 필요해`)
    if (e.required !== undefined && typeof e.required !== 'boolean') errors.push(`${p}.required: true 또는 false 로 입력해 줘`)
    if (kind.error || name.error || !name.value) return
    if ((kind.value === 'bbq' || kind.value === 'fire') && extras.some((x) => x.kind === kind.value)) {
      return errors.push(`${p}: ${kind.value === 'bbq' ? '바비큐' : '불멍'} 항목은 객실당 하나만 넣을 수 있어`)
    }
    const id = `ext_${i}`
    extras.push({ id, kind: kind.value, name: name.value, defaultPrice: dp.error ? null : dp.value, required: e.required === true })
    for (const key of [e.id, name.value, kind.value !== 'custom' ? kind.value : null]) {
      if (typeof key !== 'string' || !key) continue
      const k = squash(key)
      if (refs.has(k) && refs.get(k) !== id) refs.set(k, null) // 같은 이름 두 개 → 모호함
      else refs.set(k, id)
    }
  })
  // 개별 등록 폼과 같게 바비큐·불멍 항목은 항상 둔다 (금액 미입력 = 가격 미확인)
  for (const d of createDefaultExtras()) {
    if (!extras.some((x) => x.kind === d.kind)) {
      extras.push(d)
      if (!refs.has(d.kind)) refs.set(d.kind, d.id)
      if (!refs.has(squash(d.name))) refs.set(squash(d.name), d.id)
    }
  }
  return { extras, refs }
}

function defaultRefs() {
  return new Map([['bbq', 'bbq'], ['바비큐', 'bbq'], ['fire', 'fire'], ['불멍', 'fire']])
}

function parseRates(raw, refs, ctx) {
  const { errors, warnings, path } = ctx
  const rates = {}
  if (raw === undefined || raw === null) return rates
  // 배열 [{checkIn, checkOut, ...}] 또는 앱 백업과 같은 { "YYYY-MM-DD_YYYY-MM-DD": {...} } 둘 다 받는다
  let list
  if (Array.isArray(raw)) list = raw.map((r, i) => [`${path} › rates[${i}]`, r, r?.checkIn, r?.checkOut])
  else if (typeof raw === 'object') {
    list = Object.entries(raw).map(([k, r]) => {
      const [a, b] = k.split('_')
      return [`${path} › rates["${k}"]`, r, r?.checkIn ?? a, r?.checkOut ?? b]
    })
  } else {
    errors.push(`${path} › rates: 배열([...])이어야 해`)
    return rates
  }
  if (list.length > BULK_LIMITS.ratesPerRoom) errors.push(`${path} › rates: 최대 ${BULK_LIMITS.ratesPerRoom}개 날짜까지야`)
  for (const [p, r, checkIn, checkOut] of list.slice(0, BULK_LIMITS.ratesPerRoom)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      errors.push(`${p}: 객체({...})여야 해`)
      continue
    }
    unknownKeys(r, RATE_KEYS, p, warnings)
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
      errors.push(`${p}: checkIn·checkOut 을 YYYY-MM-DD 형식으로 넣어 줘 (지금 ${JSON.stringify(checkIn ?? null)} ~ ${JSON.stringify(checkOut ?? null)})`)
      continue
    }
    const nights = nightsBetween(checkIn, checkOut)
    if (nights < 1) {
      errors.push(`${p}: 체크아웃(${checkOut})은 체크인(${checkIn}) 다음 날 이후여야 해`)
      continue
    }
    if (nights > 30) {
      errors.push(`${p}: 최대 30박까지 넣을 수 있어 (${nights}박)`)
      continue
    }
    const key = `${checkIn}_${checkOut}`
    if (rates[key]) {
      errors.push(`${p}: ${checkIn}~${checkOut} 날짜가 두 번 들어 있어`)
      continue
    }
    const rp = price(r.roomPrice, `${p}.roomPrice`)
    const av = mapped(AVAILABILITY_VALUE, r.availability, `${p}.availability`, 'available / unavailable / unchecked')
    let checkedAt = ''
    if (r.checkedAt !== undefined && r.checkedAt !== null && r.checkedAt !== '') {
      if (isIsoDate(r.checkedAt)) checkedAt = r.checkedAt
      else errors.push(`${p}.checkedAt: YYYY-MM-DD 형식이어야 해 ("${r.checkedAt}")`)
    }
    for (const x of [rp, av]) if (x.error) errors.push(x.error)
    const extraPrices = {}
    if (r.extraPrices !== undefined && r.extraPrices !== null) {
      if (typeof r.extraPrices !== 'object' || Array.isArray(r.extraPrices)) {
        errors.push(`${p}.extraPrices: { "추가금 이름": 금액 } 형태여야 해`)
      } else {
        for (const [name, v] of Object.entries(r.extraPrices)) {
          const id = refs.get(squash(name))
          if (id === undefined) {
            errors.push(`${p}.extraPrices: "${name}" 추가금이 extras 에 없어`)
            continue
          }
          if (id === null) {
            errors.push(`${p}.extraPrices: "${name}" 이름의 추가금이 여러 개라 어느 것인지 알 수 없어`)
            continue
          }
          const ep = price(v, `${p}.extraPrices["${name}"]`)
          if (ep.error) errors.push(ep.error)
          else if (ep.value !== null) extraPrices[id] = ep.value // null = 이 날짜도 기본값 사용
        }
      }
    }
    rates[key] = {
      roomPrice: rp.error ? null : rp.value,
      extraPrices,
      availability: av.error ? 'unchecked' : av.value,
      checkedAt,
    }
  }
  return rates
}

function parseRoom(raw, ctx) {
  const { errors, warnings, path } = ctx
  const room = createEmptyRoom('')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${path}: 객체({...})여야 해`)
    return room
  }
  unknownKeys(raw, ROOM_KEYS, path, warnings)
  const take = (key, r) => {
    if (r.error) errors.push(r.error)
    else room[key] = r.value
  }
  const name = text(raw.name, MAX.roomName, `${path}.name`)
  if (name.error) errors.push(name.error)
  else if (!name.value) errors.push(`${path}.name: 객실명이 필요해`)
  else room.name = name.value

  take('baseGuests', guests(raw.baseGuests, `${path}.baseGuests`))
  take('maxGuests', guests(raw.maxGuests, `${path}.maxGuests`))
  if (room.baseGuests && room.maxGuests && room.maxGuests < room.baseGuests)
    errors.push(`${path}.maxGuests: 최대 인원(${room.maxGuests})이 기준 인원(${room.baseGuests})보다 적어`)
  take('size', text(raw.size, MAX.size, `${path}.size`))
  take('bedType', text(raw.bedType, MAX.bedType, `${path}.bedType`))
  take('description', text(raw.description, MAX.description, `${path}.description`))
  take('checkIn', text(raw.checkInTime ?? raw.checkIn, MAX.time, `${path}.checkInTime`))
  take('checkOut', text(raw.checkOutTime ?? raw.checkOut, MAX.time, `${path}.checkOutTime`))
  take('bookingUrl', url(raw.bookingUrl, `${path}.bookingUrl`))
  take('cancelPolicy', text(raw.cancelPolicy, MAX.cancelPolicy, `${path}.cancelPolicy`))
  take('notes', text(raw.notes, MAX.notes, `${path}.notes`))

  // 사진 URL
  if (raw.imageUrls !== undefined && raw.imageUrls !== null) {
    if (!Array.isArray(raw.imageUrls)) errors.push(`${path}.imageUrls: 주소 배열(["https://..."])이어야 해`)
    else {
      if (raw.imageUrls.length > BULK_LIMITS.imagesPerRoom)
        errors.push(`${path}.imageUrls: 사진은 객실당 최대 ${BULK_LIMITS.imagesPerRoom}장이야`)
      const seen = new Set()
      raw.imageUrls.slice(0, BULK_LIMITS.imagesPerRoom).forEach((u, i) => {
        const r = url(u, `${path}.imageUrls[${i}]`, { image: true })
        if (r.error) errors.push(r.error)
        else if (r.value && !seen.has(r.value)) {
          seen.add(r.value)
          room.images.push({ type: 'url', url: r.value })
        }
      })
    }
  }

  // 시설: 없는 항목은 '확인 필요' 그대로
  if (raw.facilities !== undefined && raw.facilities !== null) {
    if (typeof raw.facilities !== 'object' || Array.isArray(raw.facilities)) errors.push(`${path}.facilities: { "시설": "있음" } 형태여야 해`)
    else {
      for (const [k, v] of Object.entries(raw.facilities)) {
        const key = FACILITY_KEY.get(squash(k))
        if (!key) {
          errors.push(`${path}.facilities: "${k}" 는 알 수 없는 시설이야 (${FACILITIES.map((f) => f.label).join(', ')})`)
          continue
        }
        const r = mapped(FACILITY_VALUE, v, `${path}.facilities["${k}"]`, '있음 / 없음 / 확인 필요')
        if (r.error) errors.push(r.error)
        else room.facilities[key] = r.value
      }
    }
  }

  // 분위기
  if (raw.mood !== undefined && raw.mood !== null) {
    if (typeof raw.mood !== 'object' || Array.isArray(raw.mood)) errors.push(`${path}.mood: { "interior": "..." } 형태여야 해`)
    else {
      for (const [k, v] of Object.entries(raw.mood)) {
        const key = MOOD_KEY.get(squash(k))
        if (!key) {
          errors.push(`${path}.mood: "${k}" 는 알 수 없는 항목이야 (interior / view / privacy / christmas)`)
          continue
        }
        const r = text(v, MAX.mood, `${path}.mood.${key}`)
        if (r.error) errors.push(r.error)
        else room.mood[key] = r.value
      }
    }
  }

  const { extras, refs } = parseExtras(raw.extras, ctx)
  room.extras = extras
  room.rates = parseRates(raw.rates, refs, ctx)
  return room
}

// ───────────── 숙소 ─────────────

function parseStay(raw, index, existingNames) {
  const label = typeof raw?.name === 'string' && raw.name.trim() ? `"${raw.name.trim().slice(0, 30)}"` : ''
  const path = `숙소 ${index + 1}${label ? ` ${label}` : ''}`
  const errors = []
  const warnings = []
  const stay = createEmptyStay()
  const rooms = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${path}: 객체({...})여야 해`)
    return { index, path, stay, rooms, errors, warnings }
  }
  unknownKeys(raw, STAY_KEYS, path, warnings)
  const take = (key, r) => {
    if (r.error) errors.push(r.error)
    else stay[key] = r.value
  }
  const name = text(raw.name, MAX.stayName, `${path}.name`)
  if (name.error) errors.push(name.error)
  else if (!name.value) errors.push(`${path}.name: 숙소명이 필요해`)
  else stay.name = name.value
  take('region', text(raw.region, MAX.region, `${path}.region`))
  take('stayType', mapped(STAY_TYPE_VALUE, raw.stayType ?? raw.type, `${path}.stayType`, STAY_TYPES.map((t) => t.label).join(' / ')))
  take('address', text(raw.address, MAX.address, `${path}.address`))
  take('homepageUrl', url(raw.homepageUrl, `${path}.homepageUrl`))
  take('memo', text(raw.memo, MAX.memo, `${path}.memo`))
  const cover = url(raw.coverImageUrl, `${path}.coverImageUrl`, { image: true })
  if (cover.error) errors.push(cover.error)
  else if (cover.value) stay.coverImage = { type: 'url', url: cover.value }

  if (raw.rooms !== undefined && raw.rooms !== null && !Array.isArray(raw.rooms)) {
    errors.push(`${path}.rooms: 객실 배열([...])이어야 해`)
  } else {
    const list = raw.rooms ?? []
    if (list.length === 0) warnings.push(`${path}: 객실 정보가 없어서 숙소만 등록돼`)
    if (list.length > BULK_LIMITS.roomsPerStay) errors.push(`${path}.rooms: 객실은 숙소당 최대 ${BULK_LIMITS.roomsPerStay}개야`)
    const names = new Set()
    list.slice(0, BULK_LIMITS.roomsPerStay).forEach((r, i) => {
      const rl = typeof r?.name === 'string' && r.name.trim() ? ` "${r.name.trim().slice(0, 30)}"` : ''
      const room = parseRoom(r, { errors, warnings, path: `${path} › 객실 ${i + 1}${rl}` })
      if (room.name) {
        if (names.has(room.name)) errors.push(`${path} › 객실 ${i + 1}: "${room.name}" 객실이 이 숙소에 두 번 들어 있어 (중복 등록 방지)`)
        names.add(room.name)
      }
      rooms.push(room)
    })
  }
  // 중복 등록 방지: 이미 같은 이름(공백·대소문자 무시)의 숙소가 있으면 등록할 수 없게 막는다
  const duplicate = !!stay.name && existingNames.has(stayNameKey(stay.name))
  if (duplicate)
    errors.push(`${path}: 같은 이름의 숙소가 이미 등록돼 있어 (중복 등록 방지). 새 객실은 기존 숙소 화면에서 추가해 줘`)
  return { index, path, stay, rooms, errors, warnings, duplicate }
}

/**
 * 붙여넣은 JSON 전체를 검사한다.
 * 입력: { "stays": [ ... ] } 또는 [ ... ] 또는 숙소 하나 { ... }
 * 반환: { error } (전체 형식 오류) 또는 { items: [{ stay, rooms, errors, warnings, duplicate }] }
 */
export function parseBulkInput(textValue, existingStayNames = []) {
  const parsed = parseJsonText(textValue)
  if (parsed.error) return { error: parsed.error }
  const v = parsed.value
  let list
  if (Array.isArray(v)) list = v
  else if (v && typeof v === 'object' && Array.isArray(v.stays)) list = v.stays
  else if (v && typeof v === 'object' && typeof v.name === 'string') list = [v]
  else return { error: '최상위는 { "stays": [ ... ] } 형태여야 해' }
  if (list.length === 0) return { error: 'stays 배열이 비어 있어' }
  if (list.length > BULK_LIMITS.stays) return { error: `한 번에 최대 ${BULK_LIMITS.stays}개 숙소까지 등록할 수 있어 (지금 ${list.length}개)` }

  const existing = new Set(existingStayNames.filter(Boolean).map(stayNameKey))
  const items = list.map((raw, i) => parseStay(raw, i, existing))
  // 붙여넣은 목록 안에서의 중복 이름 → 두 번째부터 등록 불가
  const seen = new Map()
  for (const it of items) {
    if (!it.stay.name) continue
    const k = stayNameKey(it.stay.name)
    if (seen.has(k)) {
      it.duplicate = true
      it.errors.push(`${it.path}: ${seen.get(k) + 1}번째 숙소와 이름이 같아 (중복 등록 방지). 하나로 합쳐 줘`)
    }
    else seen.set(k, it.index)
  }
  return { items }
}

export function summarizeFacilities(facilities) {
  const out = { yes: [], no: [], unknown: [] }
  for (const f of FACILITIES) out[facilities[f.key] ?? 'unknown'].push(f.label)
  return out
}

/** 형식 안내용 예시. 실제 숙소처럼 보이지 않도록 자리표시 값만 쓴다 (가짜 데이터 금지 규칙). */
export const BULK_EXAMPLE = {
  stays: [
    {
      name: '숙소 이름',
      stayType: '글램핑',
      region: '지역',
      address: '도로명 주소',
      homepageUrl: 'https://example.com/stay',
      coverImageUrl: 'https://example.com/cover.jpg',
      memo: '메모',
      rooms: [
        {
          name: '객실 이름',
          baseGuests: 2,
          maxGuests: 4,
          size: '면적',
          bedType: '침대 구성',
          description: '객실 설명',
          imageUrls: ['https://example.com/room-1.jpg', 'https://example.com/room-2.jpg'],
          extras: [
            { kind: 'bbq', name: '바비큐', defaultPrice: 30000, required: false },
            { kind: 'fire', name: '불멍', defaultPrice: null, required: false },
            { kind: 'custom', name: '추가 항목 이름', defaultPrice: 10000, required: true },
          ],
          rates: [
            {
              checkIn: '2026-12-24',
              checkOut: '2026-12-25',
              roomPrice: 250000,
              availability: 'available',
              checkedAt: '2026-11-14',
              extraPrices: { 바비큐: 35000 },
            },
            { checkIn: '2026-12-25', checkOut: '2026-12-26', roomPrice: null, availability: 'unchecked' },
          ],
          facilities: { 개별화장실: '있음', 난방: '있음', 와이파이: '확인 필요', 스파: '없음' },
          mood: { interior: '', view: '', privacy: '', christmas: '' },
          checkInTime: '15:00',
          checkOutTime: '11:00',
          bookingUrl: 'https://example.com/booking',
          cancelPolicy: '취소 규정',
          notes: '기타 메모',
        },
      ],
    },
  ],
}

export const CHATGPT_PROMPT = `아래 형식의 JSON 으로만 답해 줘. 설명 문장 없이 JSON 만.
규칙:
- 모르는 금액은 null (0 으로 쓰지 마)
- 시설은 "있음" / "없음" / "확인 필요" 중 하나. 확실하지 않으면 "확인 필요"
- 날짜별 가격은 실제로 확인한 날짜 구간만 rates 에 넣어 (checkIn, checkOut 은 YYYY-MM-DD)
- availability 는 available(예약 가능) / unavailable(예약 불가) / unchecked(확인 전)
- 사진·예약 링크는 https:// 로 시작하는 실제 주소만. 모르면 빼
- stayType(숙소 유형): ${STAY_TYPES.map((t) => t.label).join(', ')} 중 하나. 모르면 빼
- 시설 이름: ${FACILITIES.map((f) => f.label).join(', ')}

형식:
${JSON.stringify(BULK_EXAMPLE, null, 2)}`
