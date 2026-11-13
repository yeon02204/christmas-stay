import { useId, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { FACILITY_STATUS } from '../../utils/models.js'
import { parsePriceInput } from '../../utils/price.js'

export function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="ml-0.5 text-burgundy" aria-hidden>*</span>}
        </span>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-burgundy" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ label, required, error, hint, className, ...props }) {
  const id = useId()
  return (
    <Field label={<label htmlFor={id}>{label}</label>} required={required} error={error} hint={hint} className={className}>
      <input id={id} className={`input ${error ? 'input-error' : ''}`} aria-invalid={!!error} {...props} />
    </Field>
  )
}

export function TextArea({ label, error, hint, className, rows = 3, ...props }) {
  const id = useId()
  return (
    <Field label={<label htmlFor={id}>{label}</label>} error={error} hint={hint} className={className}>
      <textarea id={id} rows={rows} className={`input resize-y leading-relaxed ${error ? 'input-error' : ''}`} {...props} />
    </Field>
  )
}

/** 금액 입력: 숫자만, 천 단위 쉼표. value 는 number | null (빈 값 = 미입력) */
export function PriceInput({ label, value, onChange, placeholder = '미입력', hint, className, compact, ariaLabel }) {
  const id = useId()
  const [raw, setRaw] = useState(null) // 편집 중 문자열
  const [error, setError] = useState(null)
  const shown = raw ?? (value === null || value === undefined ? '' : value.toLocaleString('ko-KR'))

  function handle(e) {
    const text = e.target.value
    const { value: v, error: err } = parsePriceInput(text)
    setError(err || null)
    if (err) {
      setRaw(text)
      return
    }
    setRaw(null)
    onChange(v)
  }
  const input = (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">₩</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className={`input pl-8 tabular-nums ${compact ? 'py-2' : ''} ${error ? 'input-error' : ''}`}
        value={shown}
        placeholder={placeholder}
        onChange={handle}
        onBlur={() => {
          if (error) {
            setRaw(null)
            setError(null)
          }
        }}
        aria-invalid={!!error}
        aria-label={ariaLabel}
      />
    </div>
  )
  if (!label) {
    return (
      <div className={className}>
        {input}
        {error && <p className="mt-1 text-xs font-medium text-burgundy" role="alert">{error}</p>}
      </div>
    )
  }
  return (
    <Field label={<label htmlFor={id}>{label}</label>} error={error} hint={hint} className={className}>
      {input}
    </Field>
  )
}

/** 1~99 정수 입력, 빈 값 = null */
export function NumberInput({ label, value, onChange, error, suffix, className }) {
  const id = useId()
  return (
    <Field label={<label htmlFor={id}>{label}</label>} error={error} className={className}>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          className={`input pr-10 ${error ? 'input-error' : ''}`}
          value={value ?? ''}
          placeholder="미입력"
          onChange={(e) => {
            const s = e.target.value.replace(/\D/g, '').slice(0, 2)
            onChange(s === '' ? null : Number(s))
          }}
        />
        {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
      </div>
    </Field>
  )
}

const TRI_STYLES = {
  yes: 'bg-pine text-white',
  no: 'bg-ink/75 text-white',
  unknown: 'bg-gold-soft text-ink',
}

/** 시설 상태 (있음 / 없음 / 확인 필요) 라디오 그룹 */
export function TriState({ label, value, onChange }) {
  const name = useId()
  return (
    <fieldset className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3.5 py-2">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm font-medium" aria-hidden>{label}</span>
      <div className="flex shrink-0 rounded-full bg-cream-deep p-0.5">
        {Object.entries(FACILITY_STATUS).map(([k, text]) => (
          <label
            key={k}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${
              value === k ? TRI_STYLES[k] : 'text-muted hover:text-ink'
            }`}
          >
            <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} className="sr-only" />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** 1~5점 별점. 같은 점수를 다시 누르면 미평가로 되돌린다 */
export function RatingInput({ label, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}점`}
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
            className="rounded-md p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
          >
            <Star className={`size-6 ${value && n <= value ? 'fill-gold text-gold' : 'text-line'}`} strokeWidth={1.6} />
          </button>
        ))}
        <span className={`ml-1 w-12 text-right text-xs ${value ? 'font-semibold text-ink' : 'text-muted'}`}>
          {value ? `${value}점` : '미평가'}
        </span>
      </div>
    </div>
  )
}

/** 폼 섹션 (접기/펼치기) */
export function FormSection({ title, icon: Icon, description, children, defaultOpen = true, badge, id }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="card overflow-hidden" id={id}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-4 text-left md:px-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
            <Icon className="size-[18px]" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="section-title block">{title}</span>
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
        {badge}
        <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div hidden={!open} className="border-t border-line/70 px-5 pb-6 pt-5 md:px-6">
        {children}
      </div>
    </section>
  )
}

export function NA({ children = '확인 필요' }) {
  return <span className="muted-na">{children}</span>
}

export function Spinner({ label = '불러오는 중' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted" role="status">
      <span className="size-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}
