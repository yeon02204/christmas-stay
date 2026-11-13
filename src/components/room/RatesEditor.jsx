import { useState } from 'react'
import { CalendarPlus, Copy, Plus, Trash2 } from 'lucide-react'
import { PriceInput } from '../common/fields.jsx'
import PriceCalculator from '../compare/PriceCalculator.jsx'
import { AVAILABILITY, EXTRA_KIND, createEmptyRate, createId } from '../../utils/models.js'
import { formatRangeKey, parseRangeKey, rangeKey, todayIso } from '../../utils/date.js'
import { validateTrip } from '../../utils/validation.js'

const AVAIL_STYLE = {
  unchecked: 'bg-gold-soft text-ink',
  available: 'bg-pine text-white',
  unavailable: 'bg-burgundy text-white',
}

/**
 * 날짜 구간별 숙박비·예약 가능 여부 + 추가금(공통 기본값 / 날짜별 금액) 편집
 */
export default function RatesEditor({ form, setForm, tripKey, errors = {} }) {
  const [selected, setSelected] = useState(tripKey)
  const keys = [...new Set([tripKey, selected, ...Object.keys(form.rates)])].sort()
  const [adding, setAdding] = useState(false)
  const [newRange, setNewRange] = useState(parseRangeKey(tripKey))
  const [selection, setSelection] = useState({ bbq: true, fire: true, custom: {} })
  const rate = form.rates[selected]
  const otherKeys = Object.keys(form.rates).filter((k) => k !== selected)
  const rangeError = validateTrip(newRange)

  const updateRate = (patch) =>
    setForm((f) => ({ ...f, rates: { ...f.rates, [selected]: { ...(f.rates[selected] || createEmptyRate()), ...patch } } }))

  function setExtraOverride(extraId, value) {
    const cur = { ...(rate?.extraPrices || {}) }
    if (value === null) delete cur[extraId]
    else cur[extraId] = value
    updateRate({ extraPrices: cur })
  }
  function copyFrom(src) {
    const s = form.rates[src]
    if (!s) return
    // 가격만 복사하고 예약 가능 여부·확인일은 '확인 전'으로 초기화
    setForm((f) => ({
      ...f,
      rates: { ...f.rates, [selected]: { roomPrice: s.roomPrice, extraPrices: { ...s.extraPrices }, availability: 'unchecked', checkedAt: '' } },
    }))
  }
  function removeRate(key) {
    setForm((f) => {
      const rates = { ...f.rates }
      delete rates[key]
      return { ...f, rates }
    })
    if (key !== tripKey) setSelected(tripKey)
  }
  function addRange() {
    if (rangeError) return
    // 선택만 하고, 실제 값을 입력할 때 그 날짜의 가격 정보가 만들어진다
    setSelected(rangeKey(newRange))
    setAdding(false)
  }
  const updateExtra = (id, patch) =>
    setForm((f) => ({ ...f, extras: f.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const addCustomExtra = () =>
    setForm((f) => ({
      ...f,
      extras: [...f.extras, { id: createId('ext'), kind: EXTRA_KIND.custom, name: '', defaultPrice: null, required: false }],
    }))
  const removeExtra = (id) =>
    setForm((f) => {
      const rates = Object.fromEntries(
        Object.entries(f.rates).map(([k, r]) => {
          const ep = { ...r.extraPrices }
          delete ep[id]
          return [k, { ...r, extraPrices: ep }]
        }),
      )
      return { ...f, extras: f.extras.filter((e) => e.id !== id), rates }
    })

  function toggleSel(extra) {
    setSelection((s) => {
      if (extra.kind === EXTRA_KIND.bbq) return { ...s, bbq: !s.bbq }
      if (extra.kind === EXTRA_KIND.fire) return { ...s, fire: !s.fire }
      return { ...s, custom: { ...s.custom, [extra.id]: !s.custom[extra.id] } }
    })
  }

  return (
    <div className="space-y-5">
      {/* 날짜 구간 선택 */}
      <div>
        <span className="field-label">가격을 입력할 날짜</span>
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="날짜 구간">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === selected}
              onClick={() => setSelected(k)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold tabular-nums transition-colors ${
                k === selected ? 'border-burgundy bg-burgundy text-white' : 'border-line bg-white text-ink/75 hover:border-gold'
              }`}
            >
              {formatRangeKey(k)}
              {k === tripKey && <span className={`ml-1.5 text-[11px] ${k === selected ? 'text-white/80' : 'text-burgundy'}`}>현재 일정</span>}
              {!form.rates[k] && <span className="ml-1 text-[11px] opacity-70">· 미입력</span>}
            </button>
          ))}
          <button type="button" onClick={() => setAdding((v) => !v)} className="shrink-0 rounded-full border border-dashed border-line px-3.5 py-2 text-[13px] font-semibold text-muted hover:border-gold hover:text-ink" aria-expanded={adding}>
            <CalendarPlus className="mr-1 inline size-4" aria-hidden />
            다른 날짜
          </button>
        </div>
        {adding && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-cream p-3">
            <label className="min-w-36 flex-1">
              <span className="field-label">체크인</span>
              <input type="date" className="input" value={newRange.checkIn} onChange={(e) => setNewRange((r) => ({ ...r, checkIn: e.target.value }))} />
            </label>
            <label className="min-w-36 flex-1">
              <span className="field-label">체크아웃</span>
              <input type="date" className="input" value={newRange.checkOut} min={newRange.checkIn} onChange={(e) => setNewRange((r) => ({ ...r, checkOut: e.target.value }))} />
            </label>
            <button type="button" className="btn-pine" onClick={addRange} disabled={!!rangeError}>
              추가
            </button>
            {rangeError && <p className="w-full text-xs text-burgundy">{rangeError}</p>}
          </div>
        )}
      </div>

      {/* 선택한 날짜의 숙박비 / 예약 가능 여부 */}
      <div className="rounded-3xl border border-line p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold tabular-nums">{formatRangeKey(selected)}</p>
          <div className="flex flex-wrap gap-2">
            {otherKeys.length > 0 && (
              <label className="relative">
                <span className="sr-only">다른 날짜 가격 복사</span>
                <select
                  className="btn-outline btn-sm appearance-none pl-8"
                  value=""
                  onChange={(e) => e.target.value && copyFrom(e.target.value)}
                >
                  <option value="">다른 날짜 가격 복사</option>
                  {otherKeys.map((k) => (
                    <option key={k} value={k}>
                      {formatRangeKey(k)}
                    </option>
                  ))}
                </select>
                <Copy className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" aria-hidden />
              </label>
            )}
            {rate && (
              <button type="button" className="btn-ghost btn-sm text-burgundy" onClick={() => removeRate(selected)}>
                <Trash2 className="size-3.5" aria-hidden /> 이 날짜 정보 삭제
              </button>
            )}
          </div>
        </div>
        {!rate && (
          <p className="mb-3 rounded-2xl bg-gold-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink/80">
            이 날짜의 가격 정보가 아직 없어. 입력하면 이 날짜에만 저장되고, 다른 날짜 가격은 자동으로 가져오지 않아.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceInput key={`room-${selected}`} label="기본 숙박비" value={rate?.roomPrice ?? null} onChange={(v) => updateRate({ roomPrice: v })} hint="이 날짜 구간 전체 숙박비" />
          <div>
            <span className="field-label">예약 가능 여부</span>
            <div className="flex rounded-full bg-cream-deep p-1" role="radiogroup" aria-label="예약 가능 여부">
              {Object.entries(AVAILABILITY).map(([k, label]) => {
                const cur = rate?.availability ?? 'unchecked'
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={cur === k}
                    onClick={() =>
                      updateRate({
                        availability: k,
                        checkedAt: k === 'unchecked' ? '' : rate?.checkedAt || todayIso(),
                      })
                    }
                    className={`flex-1 rounded-full px-2 py-2 text-[13px] font-semibold transition-colors ${cur === k ? AVAIL_STYLE[k] : 'text-muted hover:text-ink'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              확인일
              <input
                type="date"
                className="input w-auto py-1.5 text-sm"
                value={rate?.checkedAt || ''}
                onChange={(e) => updateRate({ checkedAt: e.target.value })}
                disabled={(rate?.availability ?? 'unchecked') === 'unchecked'}
              />
            </label>
          </div>
        </div>
        {errors[`rate_${selected}`] && <p className="mt-2 text-xs text-burgundy">{errors[`rate_${selected}`]}</p>}
      </div>

      {/* 추가 비용 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label mb-0">추가 비용</span>
          <button type="button" className="btn-outline btn-sm" onClick={addCustomExtra}>
            <Plus className="size-3.5" aria-hidden /> 항목 추가
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          기본 금액은 모든 날짜에 공통으로 쓰여. 이 날짜만 금액이 다르면 오른쪽 칸에 입력해. 금액을 비워 두면 ‘가격 미확인’으로 표시돼.
        </p>
        <ul className="space-y-2.5">
          {form.extras.map((e) => {
            const override = rate?.extraPrices?.[e.id] ?? null
            const fixed = e.kind !== EXTRA_KIND.custom
            return (
              <li key={e.id} className="rounded-2xl border border-line bg-white p-3">
                <div className="grid gap-2.5 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-muted">항목명</span>
                    {fixed ? (
                      <p className="flex min-h-10 items-center text-sm font-semibold">{e.name}</p>
                    ) : (
                      <input
                        className={`input py-2 ${errors[`extra_${e.id}`] ? 'input-error' : ''}`}
                        value={e.name}
                        placeholder="예: 인원 추가, 조식"
                        onChange={(ev) => updateExtra(e.id, { name: ev.target.value })}
                        aria-label="추가 비용 항목명"
                        maxLength={50}
                      />
                    )}
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-muted">기본 금액 (공통)</span>
                    <PriceInput compact value={e.defaultPrice} onChange={(v) => updateExtra(e.id, { defaultPrice: v })} placeholder="가격 미확인" ariaLabel={`${e.name || '항목'} 기본 금액`} />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-muted">이 날짜 금액</span>
                    <PriceInput key={`ov-${selected}`} compact value={override} onChange={(v) => setExtraOverride(e.id, v)} placeholder="기본 금액 사용" ariaLabel={`${e.name || '항목'} 이 날짜 금액`} />
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <div className="flex rounded-full bg-cream-deep p-0.5 text-xs font-semibold" role="radiogroup" aria-label={`${e.name || '항목'} 필수 여부`}>
                      {[
                        [false, '선택'],
                        [true, '필수'],
                      ].map(([v, label]) => (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={e.required === v}
                          onClick={() => updateExtra(e.id, { required: v })}
                          className={`rounded-full px-3 py-1.5 ${e.required === v ? (v ? 'bg-burgundy text-white' : 'bg-white text-ink shadow-soft') : 'text-muted'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="icon-btn text-muted hover:text-burgundy" onClick={() => removeExtra(e.id)} aria-label={`${e.name || '항목'} 삭제`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {errors[`extra_${e.id}`] && <p className="mt-1.5 text-xs text-burgundy">{errors[`extra_${e.id}`]}</p>}
              </li>
            )
          })}
          {form.extras.length === 0 && <li className="text-sm text-muted">추가 비용 항목이 없어</li>}
        </ul>
      </div>

      <PriceCalculator room={form} rangeKey={selected} selection={selection} onToggle={toggleSel} title="총비용 미리보기" />
    </div>
  )
}
