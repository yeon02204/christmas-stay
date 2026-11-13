import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import { useStore } from '../../store/AppStore.jsx'
import { useToast } from '../common/Toast.jsx'
import { formatRange } from '../../utils/date.js'
import { validateTrip } from '../../utils/validation.js'

export default function TripDatePicker({ className = '' }) {
  const { state, actions } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(state.trip)
  const [busy, setBusy] = useState(false)
  const error = validateTrip(draft)

  async function save() {
    if (error) return
    setBusy(true)
    try {
      await actions.setTrip(draft)
      toast.success('여행 날짜를 변경했어')
      setOpen(false)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(state.trip)
          setOpen(true)
        }}
        className={`inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink shadow-soft transition-colors hover:border-gold ${className}`}
        aria-label={`여행 날짜 ${formatRange(state.trip)}, 변경하기`}
      >
        <CalendarDays className="size-4 text-burgundy" aria-hidden />
        <span className="tabular-nums">{formatRange(state.trip)}</span>
      </button>
      <ConfirmDialog
        open={open}
        title="여행 날짜 변경"
        description="두 사람이 함께 쓰는 공동 일정이야. 날짜를 바꾸면 그 날짜 구간에 입력된 가격·예약 정보만 보이고, 다른 날짜 정보가 자동으로 옮겨지지는 않아."
        confirmLabel="변경"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={save}
      >
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">체크인</span>
            <input
              type="date"
              className="input"
              value={draft.checkIn}
              onChange={(e) => setDraft((d) => ({ ...d, checkIn: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="field-label">체크아웃</span>
            <input
              type="date"
              className="input"
              value={draft.checkOut}
              min={draft.checkIn}
              onChange={(e) => setDraft((d) => ({ ...d, checkOut: e.target.value }))}
            />
          </label>
        </div>
        <p className={`mt-2 text-xs ${error ? 'font-medium text-burgundy' : 'text-muted'}`} role={error ? 'alert' : undefined}>
          {error || formatRange(draft)}
        </p>
      </ConfirmDialog>
    </>
  )
}
