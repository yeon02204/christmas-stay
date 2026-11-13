import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  ClipboardPaste,
  Coins,
  ExternalLink,
  FileJson,
  ImageIcon,
  Info,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import UnsavedDialog from '../components/common/UnsavedDialog.jsx'
import Photo from '../components/common/Photo.jsx'
import { useToast } from '../components/common/Toast.jsx'
import { useStore } from '../store/AppStore.jsx'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard.js'
import { runBulkImport } from '../services/bulkImport.js'
import { BULK_EXAMPLE, CHATGPT_PROMPT, parseBulkInput, summarizeFacilities } from '../utils/bulkImport.js'
import { AVAILABILITY, MOOD_FIELDS, STAY_TYPE_LABEL } from '../utils/models.js'
import { formatRangeKey } from '../utils/date.js'
import { formatWon } from '../utils/price.js'

export default function BulkImportPage() {
  const { state, actions } = useStore()
  const toast = useToast()
  const textId = useId()
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState(null) // { error } | { items }
  const [selected, setSelected] = useState(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)
  const running = !!progress
  const { blocker } = useUnsavedGuard(running || (!!input.trim() && !results))

  const items = parsed?.items ?? []
  const chosen = items.filter((it) => selected.has(it.index) && it.errors.length === 0)
  const roomCount = chosen.reduce((n, it) => n + it.rooms.length, 0)
  const errorCount = items.reduce((n, it) => n + it.errors.length, 0)

  function check(textValue = input) {
    const res = parseBulkInput(textValue, state.stays)
    setParsed(res)
    setResults(null)
    // 오류 없는 숙소만 기본 선택. 이미 같은 이름이 있으면 기본 해제
    setSelected(new Set((res.items ?? []).filter((it) => !it.errors.length && !it.duplicate).map((it) => it.index)))
    if (res.error) toast.error(res.error)
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (!t) return toast.info('클립보드가 비어 있어')
      setInput(t)
      check(t)
    } catch {
      toast.info('붙여넣기 권한이 없어. 입력칸에 Ctrl+V 로 붙여넣어 줘')
    }
  }

  async function copy(textValue, label) {
    try {
      await navigator.clipboard.writeText(textValue)
      toast.success(`${label}을 복사했어`)
    } catch {
      toast.error('복사하지 못했어. 직접 선택해서 복사해 줘')
    }
  }

  async function run() {
    setConfirming(false)
    setProgress({ index: 0, total: chosen.length, name: '', step: '준비 중' })
    try {
      const res = await runBulkImport(chosen, { onProgress: setProgress })
      setResults(res.map((r, i) => ({ ...r, index: chosen[i].index })))
      await actions.refresh({ silent: true }).catch(() => {})
      const ok = res.filter((r) => r.status === 'ok').length
      const failed = res.length - ok
      if (failed === 0) toast.success(`숙소 ${ok}개를 등록했어`)
      else toast.error(`${ok}개 등록, ${failed}개 실패. 아래에서 이유를 확인해 줘`)
      // 성공한 숙소는 선택 해제 → '실패한 것만 다시 시도' 가 바로 가능
      const okIdx = new Set(res.map((r, i) => (r.status === 'ok' ? chosen[i].index : null)))
      setSelected((s) => new Set([...s].filter((i) => !okIdx.has(i))))
    } finally {
      setProgress(null)
    }
  }

  const toggle = (index) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(index)) n.delete(index)
      else n.add(index)
      return n
    })
  const resultByIndex = useMemo(() => new Map((results ?? []).map((r) => [r.index, r])), [results])

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-36">
      <div className="flex items-center gap-2">
        <Link to="/" className="icon-btn -ml-2" aria-label="홈으로 돌아가기">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-serif text-2xl font-bold">숙소 일괄 등록</h1>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        JSON 으로 정리한 숙소 여러 개를 한 번에 등록해. 붙여넣고 <b>확인하기</b>를 누르면 저장 전에 미리보기와 오류를 보여 줄게.
        하나씩 입력하려면 <Link to="/stays/new" className="font-semibold text-burgundy underline">개별 등록</Link>을 써.
      </p>

      <FormatGuide onCopy={copy} />

      <section className="card space-y-3 p-4 md:p-6">
        <label htmlFor={textId} className="field-label">
          숙소 JSON
        </label>
        <textarea
          id={textId}
          className="input min-h-56 resize-y font-mono text-[13px] leading-relaxed"
          spellCheck={false}
          placeholder={'{ "stays": [ { "name": "...", "rooms": [ ... ] } ] }'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => check()} disabled={running || !input.trim()}>
            <FileJson className="size-4" aria-hidden /> 확인하기
          </button>
          <button type="button" className="btn-outline" onClick={pasteFromClipboard} disabled={running}>
            <ClipboardPaste className="size-4" aria-hidden /> 클립보드에서 붙여넣기
          </button>
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
        {parsed?.error && (
          <p className="flex items-start gap-2 rounded-2xl bg-burgundy-soft px-4 py-3 text-sm text-burgundy" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {parsed.error}
          </p>
        )}
      </section>

      {items.length > 0 && (
        <section aria-label="미리보기" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">미리보기</h2>
            <p className="text-sm text-muted" data-testid="bulk-summary">
              숙소 {items.length}개 · 객실 {items.reduce((n, it) => n + it.rooms.length, 0)}개
              {errorCount > 0 && <b className="ml-1 text-burgundy">· 오류 {errorCount}건</b>}
            </p>
          </div>
          {items.map((it) => (
            <StayPreview
              key={it.index}
              item={it}
              checked={selected.has(it.index)}
              onToggle={() => toggle(it.index)}
              disabled={running}
              result={resultByIndex.get(it.index)}
            />
          ))}
        </section>
      )}

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm" aria-live="polite">
              {running ? (
                <>
                  <b>
                    {progress.index + 1}/{progress.total}
                  </b>{' '}
                  {progress.name && `"${progress.name}"`} {progress.step}…
                </>
              ) : (
                <>
                  선택 <b>{chosen.length}</b>개 숙소 · 객실 <b>{roomCount}</b>개
                </>
              )}
            </p>
            <button type="button" className="btn-primary" disabled={running || chosen.length === 0} onClick={() => setConfirming(true)}>
              {running ? '등록 중…' : results ? '선택한 숙소 다시 등록' : '선택한 숙소 등록'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`숙소 ${chosen.length}개를 등록할까?`}
        confirmLabel="등록하기"
        onCancel={() => setConfirming(false)}
        onConfirm={run}
        description={
          <>
            <p>
              객실 {roomCount}개도 함께 저장돼. 기존 숙소는 바뀌지 않아.
            </p>
            <p className="mt-2 text-xs">
              숙소마다 따로 저장해. 어떤 숙소의 객실 저장이 실패하면 그 숙소는 통째로 되돌리고, 나머지 숙소는 계속 등록할게.
            </p>
          </>
        }
      />
      <UnsavedDialog blocker={blocker} />
    </div>
  )
}

function FormatGuide({ onCopy }) {
  const [open, setOpen] = useState(false)
  const example = JSON.stringify(BULK_EXAMPLE, null, 2)
  return (
    <section className="card p-4 md:p-6">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Info className="size-4 text-gold" aria-hidden /> JSON 형식 · ChatGPT 요청문
        </span>
        <ChevronDown className={`size-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-4 space-y-3 text-sm leading-relaxed">
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>필수는 숙소 <code>name</code> 과 객실 <code>name</code> 뿐이야. 모르는 건 빼거나 null 로 둬.</li>
            <li>모르는 금액은 <code>null</code>. 0 으로 쓰면 0원으로 저장돼.</li>
            <li>시설은 <code>있음</code> / <code>없음</code> / <code>확인 필요</code>. 적지 않은 시설은 '확인 필요'로 저장돼.</li>
            <li>가격은 <code>rates</code> 에 적은 날짜 구간에만 들어가. 다른 날짜로 복사되지 않아.</li>
            <li><code>extraPrices</code> 는 그 날짜에만 다른 추가금이야. 키는 추가금 이름(예: 바비큐).</li>
            <li>ChatGPT 답변의 <code>```json</code> 표시는 그대로 붙여넣어도 돼.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => onCopy(CHATGPT_PROMPT, 'ChatGPT 요청문')}>
              <ClipboardCopy className="size-4" aria-hidden /> ChatGPT 요청문 복사
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => onCopy(example, '예시 JSON')}>
              <ClipboardCopy className="size-4" aria-hidden /> 예시 JSON 복사
            </button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-2xl bg-cream-deep p-3 text-xs leading-relaxed">{example}</pre>
        </div>
      )}
    </section>
  )
}

function StayPreview({ item, checked, onToggle, disabled, result }) {
  const { stay, rooms, errors, warnings, duplicate } = item
  const hasError = errors.length > 0
  const boxId = useId()
  return (
    <article
      className={`card overflow-hidden ${hasError ? 'ring-2 ring-burgundy/40' : ''}`}
      aria-label={`${stay.name || `숙소 ${item.index + 1}`} 미리보기`}
    >
      <div className="flex gap-3 p-4">
        <input
          id={boxId}
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-burgundy"
          checked={checked && !hasError}
          disabled={disabled || hasError}
          onChange={onToggle}
          aria-label={`${stay.name || `숙소 ${item.index + 1}`} 등록에 포함`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={boxId} className="font-serif text-lg font-bold">
              {stay.name || <span className="muted-na">이름 없음</span>}
            </label>
            {STAY_TYPE_LABEL[stay.stayType] && <span className="chip bg-pine-soft text-pine">{STAY_TYPE_LABEL[stay.stayType]}</span>}
            {stay.region && <span className="chip bg-gold-soft text-ink">{stay.region}</span>}
            {duplicate && <span className="chip bg-burgundy-soft text-burgundy">중복</span>}
            {hasError && <span className="chip bg-burgundy text-white">오류 {errors.length}건</span>}
            <ResultChip result={result} />
          </div>
          {stay.address && <p className="mt-1 break-all text-sm text-muted">{stay.address}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {stay.homepageUrl && <LinkOut href={stay.homepageUrl}>홈페이지</LinkOut>}
            <span>대표사진 {stay.coverImage ? '있음' : '없음(첫 객실 사진 사용)'}</span>
            <span>객실 {rooms.length}개</span>
          </div>
          {stay.memo && <p className="mt-2 whitespace-pre-line break-words text-sm">{stay.memo}</p>}
        </div>
        {stay.coverImage && (
          <Photo image={stay.coverImage} alt="" className="hidden size-20 shrink-0 rounded-2xl sm:block" iconSize="size-5" />
        )}
      </div>

      <Messages errors={errors} warnings={warnings} result={result} />

      {rooms.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {rooms.map((room, i) => (
            <RoomPreview key={i} room={room} index={i} />
          ))}
        </ul>
      )}
    </article>
  )
}

function ResultChip({ result }) {
  if (!result) return null
  if (result.status === 'ok')
    return (
      <span className="chip bg-pine text-white">
        <CheckCircle2 className="size-3.5" aria-hidden /> 등록됨
      </span>
    )
  return (
    <span className="chip bg-burgundy text-white">
      <XCircle className="size-3.5" aria-hidden /> {result.status === 'skipped' ? '건너뜀' : '실패'}
    </span>
  )
}

function Messages({ errors, warnings, result }) {
  if (!errors.length && !warnings.length && !result) return null
  return (
    <div className="space-y-2 px-4 pb-4">
      {result?.status === 'ok' && (
        <p className="rounded-2xl bg-pine-soft px-3 py-2 text-sm text-pine">
          객실 {result.rooms}개와 함께 등록했어.{' '}
          <Link to={`/stays/${result.stayId}`} className="font-semibold underline">
            숙소 보기
          </Link>
        </p>
      )}
      {result && result.status !== 'ok' && (
        <div className="rounded-2xl bg-burgundy-soft px-3 py-2 text-sm text-burgundy" role="alert">
          <p>
            <b>{result.status === 'skipped' ? '건너뜀' : '등록 실패'}</b>
            {result.failedRoom && ` (객실 "${result.failedRoom}" 저장 중)`}: {result.error}
          </p>
          {result.status === 'failed' &&
            (result.rolledBack ? (
              <p className="mt-1 text-xs">이 숙소는 저장되지 않았어 (중간에 저장된 내용은 되돌렸어). 고친 뒤 다시 등록하면 돼.</p>
            ) : (
              <p className="mt-1 text-xs">
                되돌리기에도 실패해서 일부가 저장돼 있어.{' '}
                <Link to={`/stays/${result.leftover}`} className="font-semibold underline">
                  이 숙소
                </Link>
                를 확인하고 필요하면 직접 삭제해 줘.
              </p>
            ))}
        </div>
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-burgundy-soft px-3 py-2 text-[13px] text-burgundy" aria-label="오류">
          {errors.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 break-words">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{e}</span>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-gold-soft px-3 py-2 text-[13px] text-ink/80" aria-label="참고">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 break-words">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RoomPreview({ room, index }) {
  const fac = summarizeFacilities(room.facilities)
  const rates = Object.entries(room.rates).sort(([a], [b]) => a.localeCompare(b))
  const moods = MOOD_FIELDS.filter((m) => room.mood[m.key])
  const guests =
    room.baseGuests || room.maxGuests
      ? `기준 ${room.baseGuests ?? '?'}명 / 최대 ${room.maxGuests ?? '?'}명`
      : null
  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <BedDouble className="size-4 text-gold" aria-hidden />
        <b>{room.name || <span className="muted-na">객실 {index + 1} (이름 없음)</span>}</b>
        {guests && <span className="text-xs text-muted">{guests}</span>}
        {room.size && <span className="text-xs text-muted">· {room.size}</span>}
        {room.bedType && <span className="text-xs text-muted">· {room.bedType}</span>}
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          · <ImageIcon className="size-3.5" aria-hidden /> 사진 {room.images.length}장
        </span>
        {room.bookingUrl && <LinkOut href={room.bookingUrl}>예약 링크</LinkOut>}
      </div>

      <div className="overflow-x-auto">
        {rates.length === 0 ? (
          <p className="text-xs text-muted">날짜별 가격: <span className="muted-na">미입력</span></p>
        ) : (
          <table className="w-full min-w-[22rem] text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">날짜</th>
                <th className="py-1 pr-2 font-medium">숙박비</th>
                <th className="py-1 pr-2 font-medium">예약</th>
                <th className="py-1 font-medium">이 날짜 추가금</th>
              </tr>
            </thead>
            <tbody>
              {rates.map(([key, r]) => (
                <tr key={key} className="border-t border-line/60">
                  <td className="py-1 pr-2 whitespace-nowrap">{formatRangeKey(key)}</td>
                  <td className="py-1 pr-2 tabular-nums">{formatWon(r.roomPrice) ?? <span className="muted-na">미입력</span>}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{AVAILABILITY[r.availability]}</td>
                  <td className="py-1">
                    {Object.entries(r.extraPrices)
                      .map(([id, p]) => `${room.extras.find((e) => e.id === id)?.name ?? id} ${formatWon(p)}`)
                      .join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-1 text-xs">
        <Coins className="size-3.5 text-gold" aria-hidden />
        {room.extras.map((e) => (
          <span key={e.id} className="chip bg-cream-deep">
            {e.name} {e.defaultPrice === null ? <span className="muted-na">가격 미확인</span> : formatWon(e.defaultPrice)}
            {e.required ? ' · 필수' : ' · 선택'}
          </span>
        ))}
      </p>

      <p className="text-xs leading-relaxed">
        <span className="font-semibold text-pine">있음 {fac.yes.length}</span>
        {fac.yes.length > 0 && <span className="text-muted"> ({fac.yes.join(', ')})</span>}
        {' · '}
        <span className="font-semibold text-burgundy">없음 {fac.no.length}</span>
        {fac.no.length > 0 && <span className="text-muted"> ({fac.no.join(', ')})</span>}
        {' · '}
        <span className="font-semibold text-muted">확인 필요 {fac.unknown.length}</span>
      </p>

      {moods.length > 0 && (
        <p className="text-xs text-muted">
          분위기: {moods.map((m) => `${m.label} "${room.mood[m.key]}"`).join(' · ')}
        </p>
      )}
    </li>
  )
}

function LinkOut({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs font-semibold text-burgundy underline">
      {children} <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}
