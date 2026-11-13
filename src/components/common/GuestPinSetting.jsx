import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { api } from '../../services/api.js'
import { useToast } from './Toast.jsx'

/**
 * 비회원 구경 비밀번호 관리 (멤버 전용, 작게).
 * 비밀번호 값은 서버가 돌려주지 않아서 여기서도 보여 주지 않는다. 켜짐 여부와 바꾼 날짜만 표시.
 */
export default function GuestPinSetting() {
  const toast = useToast()
  const [status, setStatus] = useState(null) // { enabled, updatedAt } | { error }
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .guestPinStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ error: true }))
    return () => {
      alive = false
    }
  }, [])

  async function save(value) {
    setBusy(true)
    try {
      const s = await api.setGuestPin(value)
      setStatus(s)
      setPin('')
      toast.success(value === null ? '구경 기능을 껐어' : '구경 비밀번호를 바꿨어. 들어와 있던 게스트는 다시 입력해야 해')
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const changed = status?.updatedAt ? new Date(status.updatedAt).toLocaleDateString('ko-KR') : null

  return (
    <section className="rounded-3xl border border-line px-5 py-4 text-sm" aria-label="구경 비밀번호">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="flex items-center gap-1.5 font-semibold text-ink/80">
          <Eye className="size-4 text-gold" aria-hidden /> 구경 비밀번호
          <span className="text-xs font-normal text-muted">
            {status === null
              ? '확인 중…'
              : status.error
                ? '상태를 불러오지 못했어 (SQL 적용 여부 확인)'
                : status.enabled
                  ? `켜짐${changed ? ` · ${changed} 변경` : ''}`
                  : '꺼짐'}
          </span>
        </p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^\d{4}$/.test(pin)) save(pin)
          }}
        >
          <input
            className="input w-24 py-1.5 text-center tabular-nums tracking-[0.3em]"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            placeholder="4자리"
            aria-label="새 구경 비밀번호 (숫자 4자리)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={busy || status?.error}
          />
          <button className="btn-outline btn-sm" disabled={busy || pin.length !== 4 || status?.error}>
            {status?.enabled ? '변경' : '켜기'}
          </button>
        </form>
      </div>
      {status?.enabled && (
        <button type="button" className="mt-1 text-xs text-muted underline underline-offset-2 hover:text-burgundy" onClick={() => save(null)} disabled={busy}>
          구경 기능 끄기
        </button>
      )}
    </section>
  )
}
