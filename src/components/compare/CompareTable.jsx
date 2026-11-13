import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Plus, X } from 'lucide-react'
import Photo from '../common/Photo.jsx'
import { NA } from '../common/fields.jsx'
import { useToast } from '../common/Toast.jsx'
import { TotalDisplay } from './PriceCalculator.jsx'
import { FacilityStatus, RatingBadge } from '../room/roomDisplay.jsx'
import { useDerived, useStore, useIsGuest } from '../../store/AppStore.jsx'
import { AVAILABILITY, EXTRA_KIND, FACILITIES, FACILITY_STATUS, MOOD_FIELDS } from '../../utils/models.js'
import { calculateTotal, effectiveExtraPrice, findCheapest, formatWon, getRate, ratingSummary } from '../../utils/price.js'

const MAIN_FACILITIES = ['toilet', 'shower', 'heating', 'hotWater', 'bbq', 'cooking', 'parking']
const OTHER_FACILITIES = FACILITIES.filter((f) => !MAIN_FACILITIES.includes(f.key))
const FACILITY_LABEL = { toilet: '화장실', shower: '샤워실', heating: '난방', hotWater: '온수', bbq: '바비큐', cooking: '취사', parking: '주차' }

function extraByKind(room, kind) {
  return room.extras.find((e) => e.kind === kind) || null
}

function extraCell(extra, rate) {
  if (!extra) return { value: '항목 없음', node: <NA>항목 없음</NA> }
  const p = effectiveExtraPrice(extra, rate)
  const tag = extra.required ? '필수' : '선택'
  if (p === null) return { value: `미확인-${tag}`, node: <span><span className="font-medium text-burgundy/80">가격 미확인</span> <span className="text-xs text-muted">· {tag}</span></span> }
  return { value: `${p}-${tag}`, node: <span><span className="tabular-nums">{formatWon(p)}</span> <span className="text-xs text-muted">· {tag}</span></span> }
}

export default function CompareTable({ rooms, highlight }) {
  const { state, actions } = useStore()
  const { key, staysById, myRatings, partnerRatings, partner, roomsByStay } = useDerived()
  const toast = useToast()
  const opts = state.compareOptions

  const results = rooms.map((r) => ({
    id: r.id,
    result: calculateTotal(r, key, { bbq: opts.bbq, fire: opts.fire, custom: opts.custom[r.id] || {} }),
  }))
  const resultOf = Object.fromEntries(results.map((x) => [x.id, x.result]))
  const cheapest = new Set(findCheapest(results))

  const groups = [
    {
      title: '기본 정보',
      rows: [
        { label: '위치', value: (r) => [staysById[r.stayId]?.region, staysById[r.stayId]?.address].filter(Boolean).join(' · '), na: '미입력' },
        {
          label: '예약 링크',
          value: (r) => (r.bookingUrl ? 'y' : ''),
          noDiff: true,
          render: (r) =>
            r.bookingUrl ? (
              <a href={r.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-pine hover:underline">
                예약 페이지 <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : (
              <NA>미입력</NA>
            ),
        },
      ],
    },
    {
      title: '가격',
      rows: [
        {
          label: '기본 숙박비',
          value: (r) => {
            const rate = getRate(r, key)
            return rate ? (rate.roomPrice ?? 'none') : 'no-rate'
          },
          render: (r) => {
            const rate = getRate(r, key)
            if (!rate) return <NA>이 날짜 정보 없음</NA>
            if (rate.roomPrice === null) return <NA>미입력</NA>
            return <b className="tabular-nums">{formatWon(rate.roomPrice)}</b>
          },
        },
        { label: '바비큐 비용', ...cellRow((r) => extraCell(extraByKind(r, EXTRA_KIND.bbq), getRate(r, key))) },
        { label: '불멍 비용', ...cellRow((r) => extraCell(extraByKind(r, EXTRA_KIND.fire), getRate(r, key))) },
        {
          label: '기타 추가 비용',
          value: (r) =>
            r.extras
              .filter((e) => e.kind === EXTRA_KIND.custom)
              .map((e) => `${e.name}:${effectiveExtraPrice(e, getRate(r, key))}:${e.required}`)
              .join('|'),
          render: (r) => {
            const customs = r.extras.filter((e) => e.kind === EXTRA_KIND.custom)
            if (!customs.length) return <NA>없음 / 확인 필요</NA>
            return (
              <ul className="space-y-1.5">
                {customs.map((e) => {
                  const p = effectiveExtraPrice(e, getRate(r, key))
                  const checked = e.required || !!opts.custom[r.id]?.[e.id]
                  return (
                    <li key={e.id}>
                      <label className={`flex items-start gap-2 ${e.required ? '' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-burgundy"
                          checked={checked}
                          disabled={e.required}
                          onChange={() => actions.toggleCustomExtra(r.id, e.id).catch((err) => toast.error(err))}
                          aria-label={`${e.name} 포함`}
                        />
                        <span className="min-w-0">
                          <span className="block">{e.name}{e.required && <span className="ml-1 text-[11px] font-semibold text-burgundy">필수</span>}</span>
                          <span className={`text-xs ${p === null ? 'font-medium text-burgundy/80' : 'text-muted tabular-nums'}`}>{p === null ? '가격 미확인' : formatWon(p)}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )
          },
        },
        {
          label: '예상 총비용',
          strong: true,
          value: (r) => `${resultOf[r.id].status}:${resultOf[r.id].total ?? resultOf[r.id].knownSum}`,
          render: (r) => <TotalDisplay result={resultOf[r.id]} cheapest={cheapest.has(r.id)} size="md" />,
        },
      ],
    },
    {
      title: '시설',
      rows: [
        ...MAIN_FACILITIES.map((k) => ({
          label: FACILITY_LABEL[k],
          value: (r) => r.facilities[k],
          render: (r) => <FacilityStatus status={r.facilities[k]} />,
        })),
        {
          label: '기타 편의시설',
          value: (r) => OTHER_FACILITIES.map((f) => r.facilities[f.key]).join(','),
          render: (r) => {
            const by = (s) => OTHER_FACILITIES.filter((f) => r.facilities[f.key] === s).map((f) => f.label)
            return (
              <div className="space-y-1 text-[13px]">
                {['yes', 'no', 'unknown'].map((s) => {
                  const list = by(s)
                  if (!list.length) return null
                  return (
                    <p key={s}>
                      <span className={`mr-1 font-semibold ${s === 'yes' ? 'text-pine' : 'text-muted'}`}>{FACILITY_STATUS[s]}</span>
                      <span className={s === 'yes' ? '' : 'text-muted'}>{list.join(', ')}</span>
                    </p>
                  )
                })}
              </div>
            )
          },
        },
      ],
    },
    {
      title: '분위기',
      rows: [
        ...MOOD_FIELDS.map((m) => ({ label: m.label, value: (r) => r.mood[m.key]?.trim() })),
        { label: '메모', value: (r) => r.notes?.trim(), na: '미입력', noDiff: true },
      ],
    },
    {
      title: '이용 조건',
      rows: [
        {
          label: '체크인/아웃',
          value: (r) => (r.checkIn || r.checkOut ? `${r.checkIn || '?'} / ${r.checkOut || '?'}` : ''),
          render: (r) =>
            r.checkIn || r.checkOut ? (
              <span className="tabular-nums">{r.checkIn || <NA />} → {r.checkOut || <NA />}</span>
            ) : (
              <NA />
            ),
        },
        {
          label: '예약 가능 여부',
          value: (r) => getRate(r, key)?.availability ?? 'none',
          render: (r) => {
            const rate = getRate(r, key)
            if (!rate) return <NA>이 날짜 정보 없음</NA>
            const cls = rate.availability === 'available' ? 'text-pine font-semibold' : rate.availability === 'unavailable' ? 'text-burgundy font-semibold' : 'text-muted'
            return (
              <span>
                <span className={cls}>{AVAILABILITY[rate.availability]}</span>
                {rate.checkedAt && <span className="block text-xs text-muted">{rate.checkedAt} 확인</span>}
              </span>
            )
          },
        },
        { label: '취소 및 환불', value: (r) => r.cancelPolicy?.trim(), small: true },
      ],
    },
    {
      title: '평가',
      rows: [
        {
          label: '내 평가',
          value: (r) => ratingSummary(myRatings[r.id]).average,
          render: (r) => <RatingCell ratings={myRatings[r.id]} />,
        },
        ...(partner
          ? [
              {
                label: `${partner.displayName} 평가`,
                value: (r) => ratingSummary(partnerRatings[r.id]).average,
                render: (r) => <RatingBadge ratings={partnerRatings[r.id]} />,
              },
            ]
          : []),
      ],
    },
    {
      title: '장단점',
      rows: [
        { label: '장점', noDiff: true, value: () => '', render: (r) => <NotesCell room={r} field="pros" /> },
        { label: '단점', noDiff: true, value: () => '', render: (r) => <NotesCell room={r} field="cons" /> },
      ],
    },
  ]

  const candidates = state.rooms.filter((r) => !state.compare.includes(r.id))
  const slots = 3 - rooms.length

  function replaceAt(index, newId) {
    const next = [...state.compare]
    next[index] = newId
    actions.setCompareList(next).catch((err) => toast.error(err))
  }

  return (
    <div className="card scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-24 md:w-36" />
          {rooms.map((r) => (
            <col key={r.id} />
          ))}
          {slots > 0 && <col />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-20 bg-white p-3 text-left align-bottom text-xs font-semibold text-muted">
              <span className="sr-only">항목</span>
            </th>
            {rooms.map((r, i) => {
              const stay = staysById[r.stayId]
              return (
                <th key={r.id} scope="col" className="p-3 text-left align-top font-normal">
                  <div className="relative">
                    <Photo image={r.images[0] || stay?.coverImage} alt={r.name} className="aspect-[4/3] w-full rounded-2xl" iconSize="size-6" />
                    <button
                      type="button"
                      onClick={() => actions.setCompareList(state.compare.filter((id) => id !== r.id)).catch((err) => toast.error(err))}
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft hover:text-burgundy"
                      aria-label={`${r.name} 비교에서 제거`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="mt-2.5 truncate text-xs font-semibold text-muted">{stay?.name}</p>
                  <Link to={`/stays/${r.stayId}/rooms/${r.id}`} className="block font-serif text-base font-bold leading-snug hover:text-burgundy">
                    {r.name}
                  </Link>
                  {candidates.length > 0 && (
                    <label className="mt-2 block">
                      <span className="sr-only">{r.name} 대신 비교할 객실</span>
                      <RoomSelect rooms={candidates} roomsByStay={roomsByStay} staysById={staysById} placeholder="다른 객실로 변경" onPick={(id) => replaceAt(i, id)} />
                    </label>
                  )}
                </th>
              )
            })}
            {slots > 0 && (
              <th scope="col" className="p-3 align-top font-normal">
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-3 text-center text-xs text-muted">
                  <Plus className="size-5" aria-hidden />
                  비교할 객실 추가 ({rooms.length}/3)
                </div>
                {candidates.length > 0 ? (
                  <label className="mt-2 block">
                    <span className="sr-only">비교할 객실 추가</span>
                    <RoomSelect rooms={candidates} roomsByStay={roomsByStay} staysById={staysById} placeholder="객실 선택" onPick={(id) => actions.setCompareList([...state.compare, id]).catch((err) => toast.error(err))} />
                  </label>
                ) : (
                  <p className="mt-2 text-center text-xs text-muted">추가할 수 있는 객실이 없어</p>
                )}
              </th>
            )}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr>
              <th colSpan={rooms.length + 1 + (slots > 0 ? 1 : 0)} scope="colgroup" className="sticky left-0 bg-cream px-3 py-2 text-left font-serif text-[13px] font-bold text-burgundy">
                <span className="sticky left-3">{g.title}</span>
              </th>
            </tr>
            {g.rows.map((row) => {
              const values = rooms.map((r) => String(row.value(r) ?? ''))
              const diff = highlight && !row.noDiff && rooms.length >= 2 && new Set(values).size > 1
              const bg = diff ? 'bg-gold-soft' : 'bg-white'
              return (
                <tr key={row.label}>
                  <th scope="row" className={`sticky left-0 z-10 border-b border-line/60 p-3 text-left align-top text-xs font-semibold text-ink/70 ${bg}`}>
                    {row.label}
                    {diff && <span className="mt-1 block w-fit rounded-full bg-gold px-1.5 text-[10px] font-bold text-white">차이</span>}
                  </th>
                  {rooms.map((r) => (
                    <td key={r.id} className={`border-b border-line/60 p-3 align-top ${bg} ${row.strong ? 'py-4' : ''} ${row.small ? 'text-[13px]' : ''}`}>
                      {row.render ? row.render(r) : row.value(r) ? <span className="whitespace-pre-line">{row.value(r)}</span> : <NA>{row.na || '확인 필요'}</NA>}
                    </td>
                  ))}
                  {slots > 0 && <td className={`border-b border-line/60 ${bg}`} />}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function cellRow(fn) {
  return { value: (r) => fn(r).value, render: (r) => fn(r).node }
}

export function RoomSelect({ rooms, roomsByStay, staysById, placeholder, onPick }) {
  const stayIds = [...new Set(rooms.map((r) => r.stayId))]
  return (
    <select className="input py-2 text-[13px]" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{placeholder}</option>
      {stayIds.map((sid) => (
        <optgroup key={sid} label={staysById[sid]?.name || '숙소'}>
          {(roomsByStay[sid] || [])
            .filter((r) => rooms.includes(r))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

function RatingCell({ ratings }) {
  const s = ratingSummary(ratings)
  return (
    <div>
      <RatingBadge ratings={ratings} />
      {!s.complete && <p className="mt-1 text-[11px] text-muted">{s.count ? '일부 항목만 평가됨' : '객실 상세에서 평가할 수 있어'}</p>}
    </div>
  )
}

function NotesCell({ room, field }) {
  if (useIsGuest()) {
    return room[field] ? (
      <p className="whitespace-pre-line text-[13px] leading-relaxed">{room[field]}</p>
    ) : (
      <span className="muted-na text-[13px]">없음</span>
    )
  }
  return <NotesEditor room={room} field={field} />
}

function NotesEditor({ room, field }) {
  const { actions } = useStore()
  const toast = useToast()
  const [text, setText] = useState(room[field])
  const [status, setStatus] = useState(null) // saving | saved
  const [synced, setSynced] = useState(room[field])
  if (synced !== room[field] && status !== 'saving') {
    // 다른 기기에서 바뀐 값을 반영
    setSynced(room[field])
    setText(room[field])
  }

  async function save() {
    if (text === room[field]) return
    setStatus('saving')
    try {
      await actions.updateRoomNotes(room.id, field === 'pros' ? text : room.pros, field === 'cons' ? text : room.cons)
      setSynced(text)
      setStatus('saved')
      setTimeout(() => setStatus(null), 1500)
    } catch (err) {
      setStatus(null)
      toast.error(err)
    }
  }
  return (
    <div>
      <textarea
        className="input min-h-20 resize-y py-2 text-[13px] leading-relaxed"
        value={text}
        maxLength={2000}
        placeholder={field === 'pros' ? '좋은 점' : '아쉬운 점'}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        aria-label={`${room.name} ${field === 'pros' ? '장점' : '단점'}`}
      />
      <p className="mt-1 h-4 text-[11px] text-muted" aria-live="polite">
        {status === 'saving' ? '저장 중…' : status === 'saved' ? '저장됨 · 두 사람이 함께 봐' : ''}
      </p>
    </div>
  )
}
