import { AlertCircle, Calculator } from 'lucide-react'
import { calculateTotal, formatWon } from '../../utils/price.js'
import { formatRangeKey } from '../../utils/date.js'

/** 총비용 결과 표시 (비교표·카드에서도 사용) */
export function TotalDisplay({ result, cheapest = false, size = 'lg' }) {
  const big = size === 'lg' ? 'text-2xl' : 'text-lg'
  if (result.status === 'no-rate')
    return <p className="text-sm text-muted">이 날짜의 가격 정보가 없어 계산할 수 없어</p>
  if (result.status === 'no-room-price')
    return <p className="text-sm text-muted">기본 숙박비가 입력되지 않아 총비용을 계산할 수 없어</p>
  if (result.status === 'incomplete')
    return (
      <div>
        <p className={`${big} font-bold tabular-nums text-ink/70`}>{formatWon(result.knownSum)} +α</p>
        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-burgundy">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          가격 미확인 {result.unknownItems.length}건 포함 ({result.unknownItems.join(', ')}) · 확정 금액 아님
        </p>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`${big} font-bold tabular-nums text-burgundy`}>{formatWon(result.total)}</p>
      {cheapest && <span className="chip bg-gold text-white">가장 저렴</span>}
    </div>
  )
}

function lineLabel(line) {
  if (line.price === null) return <span className="text-sm font-medium text-burgundy/80">가격 미확인</span>
  return <span className="text-sm tabular-nums">{formatWon(line.price)}</span>
}

/**
 * 총비용 = 기본 숙박비 + 필수 추가금 + 선택한 선택 추가금
 * selection: { bbq, fire, custom: { [extraId]: true } }
 */
export default function PriceCalculator({ room, rangeKey, selection, onToggle, title = '예상 총비용' }) {
  const result = calculateTotal(room, rangeKey, selection)
  return (
    <div className="rounded-3xl border border-line bg-cream/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-serif font-bold">
          <Calculator className="size-4 text-gold" aria-hidden />
          {title}
        </h3>
        <span className="text-xs text-muted tabular-nums">{formatRangeKey(rangeKey)}</span>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span>기본 숙박비</span>
          {result.roomPrice !== null ? (
            <span className="tabular-nums font-semibold">{formatWon(result.roomPrice)}</span>
          ) : (
            <span className="text-muted">{result.status === 'no-rate' ? '이 날짜 정보 없음' : '미입력'}</span>
          )}
        </li>
        {result.lines.map((line) => (
          <li key={line.extra.id} className="flex items-center justify-between gap-3">
            {line.extra.required ? (
              <span className="flex items-center gap-2">
                <span className="chip bg-burgundy-soft px-2 py-0.5 text-[11px] text-burgundy">필수</span>
                {line.extra.name}
              </span>
            ) : (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-burgundy"
                  checked={line.included}
                  onChange={() => onToggle?.(line.extra)}
                  disabled={!onToggle}
                />
                {line.extra.name}
                <span className="text-[11px] text-muted">선택</span>
              </label>
            )}
            <span className={line.included ? '' : 'opacity-45'}>{lineLabel(line)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-dashed border-line pt-3.5">
        <TotalDisplay result={result} />
      </div>
    </div>
  )
}
