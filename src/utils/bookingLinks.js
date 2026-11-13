// 예약 링크 일괄 업데이트: JSON 의 stayName 을 기존 숙소 이름과 맞춰 보고, 저장 전에 결과를 분류한다.
// 새 숙소는 절대 만들지 않는다. 바꾸는 값은 객실의 예약 링크(rooms.booking_url) 하나뿐이다.

import { addressKey, parseJsonText, stayNameKey } from './bulkImport.js'
import { isValidUrl } from './validation.js'

const NAME_KEYS = ['stayName', 'name', 'stay', '숙소명']
const URL_KEYS = ['bookingUrl', 'bookingLink', 'booking_url', 'url', 'link', '예약링크', '예약 링크']
const LIST_KEYS = ['updates', 'stays', 'items', 'bookingLinks', 'links', 'data']
// 매칭 근거로만 쓰는 보조 정보 (저장하지 않음)
const REGION_KEYS = ['region', '지역']
const ADDRESS_KEYS = ['address', '주소']
const HOMEPAGE_KEYS = ['homepageUrl', 'homepage', '홈페이지']

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
    const str = (keys) => {
      const x = pick(raw, keys)?.value
      return typeof x === 'string' ? x.trim() : ''
    }
    let error = null
    if (!stayName) error = 'stayName(숙소명)이 없어'
    else if (!url) error = 'bookingUrl(예약 링크)이 없어'
    else if (!isValidUrl(url) || /\s/.test(url)) error = `예약 링크가 http:// 또는 https:// 주소가 아니야 ("${url.slice(0, 80)}")`
    return { line, stayName, url, error, region: str(REGION_KEYS), address: str(ADDRESS_KEYS), homepage: str(HOMEPAGE_KEYS) }
  })
  return { entries }
}

// ───────────────────────── 매칭 ─────────────────────────
// 원칙: 이름이 비슷하다는 이유만으로는 절대 자동 연결하지 않는다.
// 자동 연결은 "후보가 정확히 하나" + 아래 근거 중 하나일 때만.
//   ① 숙소명 일치(공백·대소문자 무시)  ② 주소·예약 페이지·홈페이지 일치  ③ 핵심 이름 일치 + 지역·주소 모순 없음
// 그 밖(후보 여럿, 부분 일치, 지역·주소가 서로 다름)은 사용자가 직접 고른다.

// 숙소 이름에 흔히 붙는 유형·수식 단어 (핵심 이름 비교 때 뺀다). 긴 단어부터.
const TYPE_WORDS = ['오토캠핑장', '오토캠핑', '게스트하우스', '캠핑장', '글램핑장', '글램핑', '카라반', '풀빌라', '펜션', '스파', '독채',
  '리조트', '호텔', '모텔', '민박', '스테이', '캠핑', 'glamping', 'pension', 'caravan', 'poolvilla', 'resort', 'hotel', 'stay']
const BASE_REGIONS = ['서울', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '부산', '인천', '대구', '대전', '광주', '울산', '세종']
const REGION_SUFFIX = /(특별자치도|특별자치시|특별시|광역시|도|시|군|구|읍|면)$/

const clean = (s) => String(s ?? '').toLowerCase().replace(/[\s·.,&+\-_/|()[\]{}'"!?~:;@#*]+/g, '')

function regionWords(stays, extra = []) {
  const set = new Set(BASE_REGIONS)
  for (const r of [...stays.map((s) => s.region), ...extra]) {
    for (const t of String(r ?? '').split(/[\s,·/]+/)) {
      const w = t.replace(REGION_SUFFIX, '')
      if (w.length >= 2) set.add(w.toLowerCase())
      if (t.length >= 2) set.add(t.toLowerCase())
    }
  }
  return [...set].sort((a, b) => b.length - a.length)
}

/** 핵심 이름: 공백·특수문자 제거 → 앞쪽 지역 단어 제거 → 유형 단어 제거 */
/** 이름 안 괄호 내용(예: "(경기 가평)")은 이름에서 빼고 지역 힌트로 쓴다 */
export function splitParen(name) {
  const hints = []
  const base = String(name ?? '').replace(/[(（[]([^)）\]]*)[)）\]]/g, (_, x) => {
    hints.push(x.trim())
    return ' '
  })
  return { base, hint: hints.join(' ') }
}

/** 공백·특수문자 제거 후 앞뒤의 지역 단어 제거 (유형 단어는 남김) */
export function nameWithoutRegion(name, regions = BASE_REGIONS) {
  let s = clean(splitParen(name).base)
  let changed = true
  while (changed) {
    changed = false
    for (const r of regions) {
      if (s.startsWith(r) && s.length > r.length + 1) {
        s = s.slice(r.length)
        changed = true
      }
      if (s.endsWith(r) && s.length > r.length + 1) {
        s = s.slice(0, -r.length)
        changed = true
      }
    }
  }
  return s
}

/** 핵심 이름: 지역 단어를 뺀 이름에서 유형 단어(글램핑·펜션·카라반…)까지 제거 */
export function coreName(name, regions = BASE_REGIONS) {
  const s = nameWithoutRegion(name, regions)
  let core = s
  for (const w of TYPE_WORDS) core = core.split(w).join('')
  return core.length >= 2 ? core : s // 유형 단어만 남는 이름이면 그대로
}

/** 이름에 들어 있는 유형 단어 묶음 (글램핑/카라반/펜션…) — 핵심 이름만 같을 때 다른 업체인지 가늠하는 데 쓴다 */
const TYPE_GROUPS = [['글램핑'], ['카라반'], ['풀빌라'], ['펜션', '스파펜션'], ['캠핑', '캠핑장', '오토캠핑'], ['리조트'], ['호텔'], ['스테이']]
function typeSet(name) {
  const c = clean(name)
  return new Set(TYPE_GROUPS.filter((g) => g.some((w) => c.includes(w))).map((g) => g[0]))
}
function typesCompatible(a, b) {
  const x = typeSet(a)
  const y = typeSet(b)
  return x.size === 0 || y.size === 0 || [...x].some((t) => y.has(t))
}

/** 같은 숙소 페이지인지 비교할 URL 키: 호스트(www 제외)+경로. 검색 결과 링크는 숙소를 특정하지 못해 제외 */
export function urlKey(u) {
  try {
    const x = new URL(u)
    const path = decodeURIComponent(x.pathname).replace(/\/+$/, '')
    if (/\/search\b/i.test(path) || path === '') return ''
    return x.hostname.replace(/^(www|m)\./, '') + path.toLowerCase()
  } catch {
    return ''
  }
}

const regionTokens = (r) =>
  new Set(
    String(r ?? '')
      .split(/[\s,·/]+/)
      .map((t) => t.replace(REGION_SUFFIX, ''))
      .filter((t) => t.length >= 2),
  )

/** 후보 하나를 평가: { stay, strong:[근거], soft:[근거], conflicts:[모순], level } */
function evaluate(entry, stay, stayRooms, ctx) {
  const strong = []
  const soft = []
  const conflicts = []
  const exactName = stayNameKey(entry.stayName) === stayNameKey(stay.name)
  // 지역 단어·띄어쓰기·특수문자 차이만 있고 나머지 이름(유형 단어 포함)이 완전히 같음
  const sameName = !exactName && nameWithoutRegion(entry.stayName, ctx.regions).length >= 2 &&
    nameWithoutRegion(entry.stayName, ctx.regions) === nameWithoutRegion(stay.name, ctx.regions)
  if (exactName) strong.push('숙소명 일치')
  else if (sameName) strong.push('숙소명 일치 (지역·띄어쓰기·특수문자 차이만)')
  const ec = coreName(entry.stayName, ctx.regions)
  const sc = coreName(stay.name, ctx.regions)
  const coreEqual = ec.length >= 2 && ec === sc
  const typeOk = typesCompatible(entry.stayName, stay.name)
  if (coreEqual && !exactName && !sameName) soft.push(`핵심 이름 일치 ("${ec}", 지역·유형 단어 제외)`)
  if (coreEqual && !exactName && !sameName && !typeOk) conflicts.push('숙소 유형 단어가 달라 (예: 글램핑 / 카라반)')
  const partial = !coreEqual && ec.length >= 2 && sc.length >= 2 && (ec.includes(sc) || sc.includes(ec))
  if (partial) soft.push(`이름 일부 일치 ("${ec}" / "${sc}")`)

  const ea = addressKey(entry.address)
  const sa = addressKey(stay.address)
  if (ea && sa) {
    if (ea === sa) strong.push('주소 일치')
    else conflicts.push('주소가 달라')
  }
  const eu = urlKey(entry.url)
  if (eu && stayRooms.some((r) => urlKey(r.bookingUrl) === eu)) strong.push('기존 예약 링크와 같은 숙소 페이지')
  const eh = urlKey(entry.homepage)
  if (eh && urlKey(stay.homepageUrl) === eh) strong.push('홈페이지 일치')
  const er = regionTokens(entry.region || splitParen(entry.stayName).hint)
  const sr = regionTokens(stay.region)
  if (er.size && sr.size) {
    if ([...er].some((t) => sr.has(t))) soft.push(`지역 일치 (${stay.region})`)
    else conflicts.push(`지역이 달라 (${entry.region} / ${stay.region})`)
  }
  const level = strong.length ? 'strong' : coreEqual ? 'core' : partial ? 'partial' : 'none'
  return { stay, strong, soft, conflicts, level, core: { entry: ec, stay: sc } }
}

const RANK = { strong: 3, core: 2, partial: 1 }

/**
 * 기존 숙소와 맞춰 본다.
 * stays: [{ id, name, region, address, homepageUrl }], rooms: [{ id, stayId, name, bookingUrl }]
 * opts.onlyEmpty : true 면 이미 링크가 있는 객실은 그대로 둔다
 * opts.choices   : { [항목키]: stayId | '' }  사용자가 직접 고른 연결 ('' = 연결 안 함)
 * opts.excluded  : Set<항목키>                  자동 연결됐지만 사용자가 뺀 항목
 * 반환 그룹
 *  - ready      : 저장할 숙소 (stay, url, rooms, reasons, auto)  ← 실제 DB 숙소 id 기준
 *  - unchanged  : 이미 모든 객실이 같은 링크 (그대로 둠)
 *  - review     : 직접 선택 필요 (후보와 근거 표시, 기본은 연결 안 함)
 *  - unmatched  : 후보 없음
 *  - ambiguous  : JSON 안에서 같은 숙소에 서로 다른 링크 / 두 항목이 같은 숙소로 연결되는데 링크가 다름
 *  - noRooms    : 숙소는 찾았지만 객실이 없어 저장할 곳이 없음
 *  - excluded   : 자동 연결됐지만 사용자가 뺀 항목
 *  - invalid    : 이름/링크가 비었거나 잘못된 주소
 */
export function matchLinkUpdates(entries, stays, rooms, { onlyEmpty = false, choices = {}, excluded = new Set() } = {}) {
  const roomsByStay = new Map()
  for (const r of rooms) roomsByStay.set(r.stayId, [...(roomsByStay.get(r.stayId) || []), r])
  const staysById = new Map(stays.map((s) => [s.id, s]))
  const ctx = { regions: regionWords(stays, entries.map((e) => e.region || splitParen(e.stayName).hint)) }

  const out = { ready: [], unchanged: [], review: [], unmatched: [], ambiguous: [], noRooms: [], excluded: [], invalid: [] }

  const valid = []
  for (const e of entries) (e.error ? out.invalid : valid).push(e)
  // JSON 안에서 같은 이름이 여러 번 → 한 항목으로 (링크가 다르면 중복으로 건너뜀)
  const groups = new Map()
  for (const e of valid) {
    const k = stayNameKey(e.stayName)
    groups.set(k, [...(groups.get(k) || []), e])
  }

  const resolved = [] // { item, stay, reasons, auto }
  for (const [key, list] of groups) {
    const first = { ...list[0] }
    for (const e of list.slice(1)) for (const f of ['region', 'address', 'homepage']) first[f] ||= e[f]
    const base = {
      ...first,
      key,
      lines: list.map((e) => e.line),
      note: list.length > 1 ? `JSON 에 ${list.length}번 들어 있음 (링크 같음, 한 번만 반영)` : null,
    }
    const urls = [...new Set(list.map((e) => e.url))]
    if (urls.length > 1) {
      out.ambiguous.push({ ...base, reason: `JSON 안에 이 숙소의 링크가 ${urls.length}개 서로 달라`, candidates: urls })
      continue
    }

    const evals = stays.map((st) => evaluate(first, st, roomsByStay.get(st.id) || [], ctx)).filter((c) => c.level !== 'none')
    evals.sort((a, b) => RANK[b.level] - RANK[a.level] || b.strong.length - a.strong.length || a.conflicts.length - b.conflicts.length)
    const candidates = evals.slice(0, 5)

    // 사용자가 직접 고른 경우가 최우선 ('' = 연결 안 함)
    if (Object.prototype.hasOwnProperty.call(choices, key)) {
      const st = staysById.get(choices[key])
      if (st) {
        const ev = evals.find((c) => c.stay.id === st.id)
        resolved.push({ item: base, stay: st, reasons: ['직접 선택', ...(ev ? [...ev.strong, ...ev.soft] : [])], auto: false })
        continue
      }
      if (choices[key] === '') {
        out.review.push({ ...base, candidates, decided: 'skip' })
        continue
      }
    }

    // 자동 연결: 가장 높은 급의 후보가 정확히 하나이고, 모순이 없을 때만
    const top = evals[0]
    const sameRank = top ? evals.filter((c) => RANK[c.level] === RANK[top.level]) : []
    const autoOk =
      top &&
      sameRank.length === 1 &&
      top.conflicts.length === 0 &&
      (top.level === 'strong' ||
        // 핵심 이름만으로 연결할 때: 3글자 이상 + 유형 단어 모순 없음(위 conflicts) 일 때만. 2글자는 겹치기 쉬워서 항상 직접 선택
        (top.level === 'core' && top.core.entry.length >= 3))
    if (autoOk) {
      const reasons = [...top.strong, ...top.soft]
      if (excluded.has(key)) out.excluded.push({ ...base, stay: top.stay, reasons })
      else resolved.push({ item: base, stay: top.stay, reasons, auto: true })
      continue
    }
    if (candidates.length) out.review.push({ ...base, candidates, decided: null })
    else out.unmatched.push({ ...base, candidates: [] })
  }

  // 서로 다른 항목이 같은 숙소로 연결되는데 링크가 다르면 둘 다 건너뜀
  const byStay = new Map()
  for (const r of resolved) byStay.set(r.stay.id, [...(byStay.get(r.stay.id) || []), r])
  for (const [, list] of byStay) {
    if (list.length > 1 && new Set(list.map((r) => r.item.url)).size > 1) {
      for (const r of list) {
        const others = list.filter((x) => x !== r).map((x) => `"${x.item.stayName}"`).join(', ')
        out.ambiguous.push({ ...r.item, reason: `다른 항목(${others})과 같은 숙소 "${r.stay.name}"로 연결되는데 링크가 달라`, candidates: [] })
      }
      continue
    }
    const r = list[0]
    const stayRooms = roomsByStay.get(r.stay.id) || []
    const item = {
      ...r.item,
      stay: r.stay,
      url: r.item.url,
      reasons: r.reasons,
      auto: r.auto,
      note: list.length > 1 ? `JSON 의 ${list.length}개 항목이 같은 숙소 (링크 같음)` : r.item.note,
    }
    if (stayRooms.length === 0) {
      out.noRooms.push(item)
      continue
    }
    const changes = stayRooms.map((room) => {
      const from = room.bookingUrl || ''
      const change = from !== r.item.url && (!onlyEmpty || from === '')
      return { room, from, to: change ? r.item.url : from, change, keptExisting: onlyEmpty && from !== '' && from !== r.item.url }
    })
    ;(changes.some((c) => c.change) ? out.ready : out.unchanged).push({ ...item, rooms: changes })
  }
  return out
}
