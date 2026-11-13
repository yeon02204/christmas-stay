import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Logo } from '../components/layout/Header.jsx'
import { auth } from '../services/api.js'

export default function LoginPage() {
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
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm p-7" noValidate>
        <Logo />
        <h1 className="mt-6 font-serif text-2xl font-bold">우리의 겨울 여행을 찾아서 ❄️</h1>
        <p className="mt-1 text-sm text-muted">함께 쓰는 계정으로 로그인해 줘.</p>
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
        <p className="mt-4 text-xs leading-relaxed text-muted">회원가입은 없어. 계정은 Supabase 대시보드에서 관리자가 만들어 줘야 해.</p>
      </form>
    </div>
  )
}
