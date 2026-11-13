import { useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileJson, Info, Link2, RotateCcw, XCircle } from 'lucide-react'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import UnsavedDialog from '../components/common/UnsavedDialog.jsx'
import { useToast } from '../components/common/Toast.jsx'
import { useStore } from '../store/AppStore.jsx'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard.js'
import { runBookingLinkUpdate } from '../services/bookingLinks.js'
import { matchLinkUpdates, parseLinkUpdates } from '../utils/bookingLinks.js'

const EXAMPLE = `[
  { "stayName": "등록된 숙소 이름", "bookingUrl": "https://example.com/booking" }
]`

export default function BookingLinksPage() {
  const { state, actions } = useStore()
  const toast = useToast()
  const textId = useId()
  const fileRef = useRef(null)
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState(null) // { error } | { entries }
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)
  const [choices, setChoices] = useState({}) // 직접 선택: { 항목키: stayId | '' }
  const [excluded, setExcluded] = useState(() => new Set()) // 자동 연결에서 뺀 항목키
  const running = !!progress
  const { blocker } = useUnsavedGuard(running)

  // 저장 후 store 가 새로고침되면 자동으로 다시 맞춰 본다 (바뀐 숙소는 '이미 같음'으로 이동)
  const match = useMemo(
    () => (parsed?.entries ? matchLinkUpdates(parsed.entries, state.stays, state.rooms, { onlyEmpty, choices, excluded }) : null),
    [parsed, state.stays, state.rooms, onlyEmpty, choices, excluded],
  )
  const changeCount = match ? match.ready.reduce((n, it) => n + it.rooms.filter((r) => r.change).length, 0) : 0

  async function check(text = input) {
    const res = parseLinkUpdates(text)
    setResults(null)
    setChoices({})
    setExcluded(new Set())
    if (res.error) {
      setParsed(res)
      return toast.error(res.error)
    }
    // 실제 Supabase 의 최신 숙소 목록 기준으로 맞춰 본다
    await actions.refresh({ silent: true }).catch(() => toast.error('최신 숙소 목록을 불러오지 못해서, 지금 화면의 목록으로 맞춰 봤어'))
    setParsed(res)
  }
  const choose = (key, stayId) => setChoices((c) => ({ ...c, [key]: stayId }))
  const unchoose = (key) =>
    setChoices((c) => {
      const n = { ...c }
      delete n[key]
      return n
    })
  const toggleExclude = (key) =>
    setExcluded((x) => {
      const n = new Set(x)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  async function pickFile(file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('파일이 너무 커 (2MB 이하)')
    const text = await file.text()
    setInput(text)
    check(text)
  }

  async function run() {
    setConfirming(false)
    const items = match.ready
    setProgress({ index: 0, total: items.length, name: '' })
    try {
      const res = await runBookingLinkUpdate(items, { onlyEmpty, onProgress: setProgress })
      await actions.refresh({ silent: true }).catch(() => {})
      setResults(res)
      const ok = res.filter((r) => r.status === 'ok').length
      const fail = res.length - ok
      if (fail === 0) toast.success(`숙소 ${ok}개의 예약 링크를 업데이트했어`)
      else toast.error(`성공 ${ok}개, 실패 ${fail}개. 아래에서 확인해 줘`)
    } finally {
      setProgress(null)
    }
  }

  const okCount = results?.filter((r) => r.status === 'ok').length ?? 0
  const failed = results?.filter((r) => r.status !== 'ok') ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-36">
      <div className="flex items-center gap-2">
        <Link to="/data" className="icon-btn -ml-2" aria-label="데이터 관리로 돌아가기">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-serif text-2xl font-bold">예약 링크 일괄 업데이트</h1>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        이미 등록된 숙소의 <b>예약 링크만</b> 바꿔. 새 숙소는 만들지 않고, 객실·가격·사진·시설·찜·평가는 그대로야.
        이름 표기가 달라도(지역·띄어쓰기·특수문자·글램핑/펜션 같은 단어) 같은 숙소가 <b>하나로 확실할 때만</b> 자동으로 연결하고,
        애매하면 직접 고르게 해. JSON 에 region·address 를 함께 넣으면 더 정확해져. 예약 링크는 객실마다 저장돼서 숙소의 모든 객실에 같은 링크가 들어가.
      </p>

      <section className="card space-y-3 p-4 md:p-6">
        <label htmlFor={textId} className="field-label">
          예약 링크 JSON
        </label>
        <textarea
          id={textId}
          className="input min-h-44 resize-y font-mono text-[13px] leading-relaxed"
          spellCheck={false}
          placeholder={EXAMPLE}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => check()} disabled={running || !input.trim()}>
            <Link2 className="size-4" aria-hidden /> 매칭 확인
          </button>
          <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()} disabled={running}>
            <FileJson className="size-4" aria-hidden /> JSON 파일 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="예약 링크 JSON 파일"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {input && (
            <button
              type="button"
              className="btn-ghost"
              disabled={running}
              onClick={() => {
                setInput('')
                setParsed(null)
                setResults(null)
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> 비우기
            </button>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-burgundy"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
            disabled={running}
          />
          <span>
            이미 예약 링크가 있는 객실은 그대로 두기
            <span className="block text-xs text-muted">끄면(기본) 숙소의 모든 객실이 새 링크로 바뀌어.</span>
          </span>
        </label>
        {parsed?.error && (
          <p className="flex items-start gap-2 rounded-2xl bg-burgundy-soft px-4 py-3 text-sm text-burgundy" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {parsed.error}
          </p>
        )}
      </section>

      {results && (
        <section className="card space-y-2 p-4 md:p-6" aria-label="업데이트 결과" data-testid="link-results">
          <h2 className="section-title">업데이트 결과</h2>
          <p className="text-sm">
            <span className="font-semibold text-pine">성공 {okCount}건</span> ·{' '}
            <span className={`font-semibold ${failed.length ? 'text-burgundy' : 'text-muted'}`}>실패 {failed.length}건</span>
          </p>
          {failed.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-burgundy-soft px-3 py-2 text-[13px] text-burgundy">
              {failed.map((r) => (
                <li key={r.stayId} className="flex items-start gap-1.5 break-words">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <b>{r.name}</b>: {r.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {match && (
        <section aria-label="매칭 미리보기" className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs" data-testid="link-summary">
            <Count tone="pine" label="업데이트 예정" n={match.ready.length} />
            <Count label="이미 같은 링크" n={match.unchanged.length} />
            <Count tone="gold" label="직접 선택 필요" n={match.review.filter((x) => x.decided !== 'skip').length} />
            <Count tone="burgundy" label="후보 없음" n={match.unmatched.length} />
            <Count tone="burgundy" label="중복 매칭" n={match.ambiguous.length} />
            <Count label="제외함" n={match.excluded.length + match.review.filter((x) => x.decided === 'skip').length} />
            <Count tone="burgundy" label="객실 없음" n={match.noRooms.length} />
            <Count tone="burgundy" label="잘못된 항목" n={match.invalid.length} />
          </div>

          <Group title="업데이트 예정" hint="저장하면 아래처럼 바뀌어. 링크 말고는 아무것도 바뀌지 않아. 체크를 빼면 이번에는 건너뛰어." items={match.ready} open>
            {(it) => (
              <>
                <LinkTarget it={it} onExclude={() => (it.auto ? toggleExclude(it.key) : unchoose(it.key))} />
                <ul className="mt-1.5 space-y-1">
                  {it.rooms.map((r) => (
                    <li key={r.room.id} className="text-xs">
                      <span className="font-semibold">{r.room.name}</span>{' '}
                      {r.change ? (
                        <span className="break-all text-muted">
                          {r.from ? <s>{r.from}</s> : <span className="muted-na">링크 없음</span>}
                          <ArrowRight className="mx-1 inline size-3" aria-hidden />
                          <span className="text-pine">{r.to}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{r.keptExisting ? '기존 링크 유지' : '이미 같은 링크'}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Group>

          <Group
            title="직접 선택 필요 (자동 연결 안 함)"
            hint="후보가 여럿이거나 확신할 수 없어서 자동으로 연결하지 않았어. 같은 숙소가 맞으면 골라 줘. 고르지 않으면 건너뛰어."
            items={match.review}
            tone="gold"
            open
          >
            {(it) => <ReviewItem it={it} value={choices[it.key]} onChoose={(id) => choose(it.key, id)} />}
          </Group>

          <Group title="후보 없음 (수정 안 함)" hint="이름·주소·링크가 맞는 등록된 숙소를 찾지 못했어." items={match.unmatched} tone="burgundy" open>
            {(it) => <StayLine it={it} />}
          </Group>

          <Group title="제외함" hint="이번 업데이트에서 뺀 항목이야." items={match.excluded} open>
            {(it) => (
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <b>"{it.stayName}"</b> → {it.stay.name}
                <button type="button" className="btn-ghost btn-sm" onClick={() => toggleExclude(it.key)}>
                  다시 포함
                </button>
              </p>
            )}
          </Group>

          <Group title="중복 매칭 (수정 안 함)" hint="어느 숙소에 넣을지 확실하지 않아서 건너뛰어." items={match.ambiguous} tone="burgundy" open>
            {(it) => (
              <>
                <StayLine it={it} />
                <p className="mt-1 break-all text-xs text-burgundy">
                  {it.reason}
                  {it.candidates.length > 0 && `: ${it.candidates.join(' / ')}`}
                </p>
              </>
            )}
          </Group>

          <Group title="객실 없음 (수정 안 함)" hint="예약 링크는 객실에 저장돼. 객실을 먼저 추가해 줘." items={match.noRooms} tone="burgundy">
            {(it) => <StayLine it={it} />}
          </Group>

          <Group title="잘못된 항목 (수정 안 함)" items={match.invalid} tone="burgundy">
            {(it) => (
              <p className="text-xs">
                <b>{it.line}번째</b> {it.stayName && `"${it.stayName}"`}: <span className="text-burgundy">{it.error}</span>
              </p>
            )}
          </Group>

          <Group title="이미 같은 링크" items={match.unchanged}>
            {(it) => <StayLine it={it} />}
          </Group>
        </section>
      )}

      {match && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm" aria-live="polite">
              {running ? (
                <>
                  <b>
                    {progress.index + 1}/{progress.total}
                  </b>{' '}
                  {progress.name && `"${progress.name}"`} 업데이트 중…
                </>
              ) : (
                <>
                  숙소 <b>{match.ready.length}</b>개 · 객실 <b>{changeCount}</b>개 링크 변경
                </>
              )}
            </p>
            <button type="button" className="btn-primary" disabled={running || match.ready.length === 0} onClick={() => setConfirming(true)}>
              {running ? '업데이트 중…' : '예약 링크 업데이트'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`숙소 ${match?.ready.length ?? 0}개의 예약 링크를 바꿀까?`}
        confirmLabel="업데이트"
        onCancel={() => setConfirming(false)}
        onConfirm={run}
        description={
          <>
            <p>객실 {changeCount}개의 예약 링크만 바뀌어. 다른 정보는 그대로야.</p>
            {(match?.unmatched.length || 0) + (match?.ambiguous.length || 0) > 0 && (
              <p className="mt-2 text-xs">이름 불일치·중복 매칭 {match.unmatched.length + match.ambiguous.length}건은 건너뛰어.</p>
            )}
          </>
        }
      />
      <UnsavedDialog blocker={blocker} />
    </div>
  )
}

function Count({ label, n, tone }) {
  const cls =
    n === 0
      ? 'bg-cream-deep text-muted'
      : tone === 'pine'
        ? 'bg-pine text-white'
        : tone === 'burgundy'
          ? 'bg-burgundy-soft text-burgundy'
          : tone === 'gold'
            ? 'bg-gold text-white'
            : 'bg-gold-soft text-ink'
  return (
    <span className={`chip ${cls}`}>
      {label} <b className="tabular-nums">{n}</b>
    </span>
  )
}

function Group({ title, hint, items, tone, open = false, children }) {
  if (!items.length) return null
  return (
    <details className={`card overflow-hidden ${tone === 'burgundy' ? 'ring-1 ring-burgundy/30' : tone === 'gold' ? 'ring-2 ring-gold/50' : ''}`} open={open}>
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold">
        <span className="flex items-center gap-2">
          {tone === 'burgundy' ? (
            <AlertCircle className="size-4 text-burgundy" aria-hidden />
          ) : title === '업데이트 예정' ? (
            <CheckCircle2 className="size-4 text-pine" aria-hidden />
          ) : (
            <Info className="size-4 text-muted" aria-hidden />
          )}
          {title} <span className="text-muted">{items.length}</span>
        </span>
        {hint && <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>}
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {items.map((it, i) => (
          <li key={i} className="px-4 py-2.5 text-sm">
            {children(it)}
          </li>
        ))}
      </ul>
    </details>
  )
}

function StayLine({ it }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <b>{it.stay ? <Link to={`/stays/${it.stay.id}`} className="hover:text-burgundy">{it.stay.name}</Link> : it.stayName}</b>
      {it.stay && stayLabel(it) && <span className="text-xs text-muted">JSON: "{it.stayName}"</span>}
      <span className="text-xs text-muted">({it.lines.join(', ')}번째)</span>
      {it.note && <span className="text-xs text-muted">· {it.note}</span>}
      {it.url && !it.rooms && <span className="break-all text-xs text-muted">{it.url}</span>}
    </p>
  )
}

const stayLabel = (it) => it.stay.name !== it.stayName

function Reasons({ reasons = [], conflicts = [] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((x) => (
        <span key={x} className="chip bg-pine-soft py-0.5 text-[11px] text-pine">
          {x}
        </span>
      ))}
      {conflicts.map((x) => (
        <span key={x} className="chip bg-burgundy-soft py-0.5 text-[11px] text-burgundy">
          ⚠ {x}
        </span>
      ))}
    </span>
  )
}

/** 업데이트 예정 항목: JSON 이름 → 최종 연결 대상(실제 DB 숙소) + 근거 */
function LinkTarget({ it, onExclude }) {
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-burgundy"
        checked
        onChange={onExclude}
        aria-label={`"${it.stayName}" 업데이트에 포함`}
      />
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-muted">JSON "{it.stayName}"</span>
          <ArrowRight className="inline size-3 text-muted" aria-hidden />
          <b>
            <Link to={`/stays/${it.stay.id}`} className="hover:text-burgundy">
              {it.stay.name}
            </Link>
          </b>
          <span className="text-[11px] text-muted" title={it.stay.id}>
            ID {it.stay.id.slice(0, 8)}
          </span>
          <span className="text-xs text-muted">({it.lines.join(', ')}번째)</span>
          {!it.auto && <span className="chip bg-gold-soft py-0.5 text-[11px]">직접 선택</span>}
        </p>
        <Reasons reasons={it.reasons.filter((x) => x !== '직접 선택')} />
        {it.note && <p className="text-xs text-muted">{it.note}</p>}
      </div>
    </div>
  )
}

/** 직접 선택: 후보 중 하나를 고르거나 연결하지 않음 */
function ReviewItem({ it, value, onChoose }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="text-sm">
        <b>JSON "{it.stayName}"</b> <span className="text-xs text-muted">({it.lines.join(', ')}번째)</span>
        {(it.region || it.address) && <span className="block text-xs text-muted">{[it.region, it.address].filter(Boolean).join(' · ')}</span>}
        <span className="block break-all text-xs text-muted">새 링크: {it.url}</span>
      </legend>
      <div className="mt-2 space-y-1.5">
        {it.candidates.map((c) => (
          <label key={c.stay.id} className="flex cursor-pointer items-start gap-2 rounded-2xl bg-cream px-3 py-2 text-sm">
            <input type="radio" name={name} className="mt-1 accent-burgundy" checked={value === c.stay.id} onChange={() => onChoose(c.stay.id)} />
            <span className="min-w-0 space-y-1">
              <span className="block">
                <b>{c.stay.name}</b> <span className="text-xs text-muted">{[c.stay.region, c.stay.address].filter(Boolean).join(' · ')}</span>
              </span>
              <Reasons reasons={[...c.strong, ...c.soft]} conflicts={c.conflicts} />
            </span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm text-muted">
          <input type="radio" name={name} className="accent-burgundy" checked={!value} onChange={() => onChoose('')} />
          연결 안 함 (건너뛰기)
        </label>
      </div>
    </fieldset>
  )
}
