import { useEffect, useState } from 'react'
import { ArrowLeft, Eye, LogIn } from 'lucide-react'
import { Logo } from '../components/layout/Header.jsx'
import { auth, guestApi } from '../services/api.js'

// onGuest(session): 구경 비밀번호 확인 성공 시 { token, expiresAt } 를 넘긴다
// notice: 구경 시간이 끝나는 등 로그인 화면에 보여 줄 안내
export default function LoginPage({ onGuest, notice }) {
  const [view, setView] = useState(() => (window.location.hash === '#guest' ? 'guest' : 'login'))

  // 브라우저 뒤로가기: 구경 비밀번호 화면 → 로그인 화면
  useEffect(() => {
    const onPop = () => setView(window.location.hash === '#guest' ? 'guest' : 'login')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openGuest(e) {
    e.preventDefault()
    window.history.pushState(null, '', '#guest')
    setView('guest')
  }
  function backToLogin() {
    if (window.location.hash === '#guest') window.history.back()
    else setView('login')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      {view === 'guest' ? (
        <GuestForm onBack={backToLogin} onGuest={onGuest} />
      ) : (
        <MemberForm onOpenGuest={openGuest} notice={notice} />
      )}
    </div>
  )
}

function MemberForm({ onOpenGuest, notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await auth.signIn(email.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7" noValidate>
      <Logo />
      <h1 className="mt-6 font-serif text-2xl font-bold">우리의 겨울 여행을 찾아서 ❄️</h1>
      <p className="mt-1 text-sm text-muted">함께 쓰는 계정으로 로그인해 줘.</p>
      {notice && <p className="mt-4 rounded-2xl bg-gold-soft px-3 py-2 text-sm text-ink/80" role="status">{notice}</p>}
      <label className="mt-6 block">
        <span className="field-label">이메일</span>
        <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label className="mt-4 block">
        <span className="field-label">비밀번호</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="mt-3 text-sm font-medium text-burgundy" role="alert">{error}</p>}
      <button className="btn-primary mt-6 w-full" disabled={busy || !email || !password}>
        <LogIn className="size-4" aria-hidden /> {busy ? '로그인 중…' : '로그인'}
      </button>
      <p className="mt-3 text-center">
        <a href="#guest" onClick={onOpenGuest} className="text-xs text-muted underline underline-offset-2 hover:text-burgundy">
          비회원으로 구경하기
        </a>
      </p>
      <p className="mt-4 text-xs leading-relaxed text-muted">회원가입은 없어. 계정은 Supabase 대시보드에서 관리자가 만들어 줘야 해.</p>
    </form>
  )
}

function GuestForm({ onBack, onGuest }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) return setError('4자리 숫자를 입력해 줘')
    setBusy(true)
    setError(null)
    try {
      const session = await guestApi.login(pin)
      window.history.replaceState(null, '', window.location.pathname + window.location.search) // #guest 지우기
      onGuest(session)
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7" noValidate>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> 로그인으로 돌아가기
      </button>
      <h1 className="mt-5 font-serif text-2xl font-bold">구경하러 왔구나 👀</h1>
      <p className="mt-1 text-sm text-muted">전달받은 4자리 비밀번호를 입력해 줘. 숙소를 보기만 할 수 있어.</p>
      <label className="mt-6 block">
        <span className="field-label">구경 비밀번호</span>
        <input
          className="input text-center text-2xl tracking-[0.6em] tabular-nums"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          autoFocus
        />
      </label>
      {error && <p className="mt-3 text-sm font-medium text-burgundy" role="alert">{error}</p>}
      <button className="btn-primary mt-6 w-full" disabled={busy || pin.length !== 4}>
        <Eye className="size-4" aria-hidden /> {busy ? '확인 중…' : '구경하기'}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-muted">구경은 6시간 동안 유지되고, 브라우저를 닫으면 다시 입력해야 해.</p>
    </form>
  )
}
