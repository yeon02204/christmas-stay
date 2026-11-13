import { Link } from 'react-router-dom'
import { LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { DesktopNav } from './Navigation.jsx'
import TripDatePicker from './TripDatePicker.jsx'
import { useStore } from '../../store/AppStore.jsx'
import { useToast } from '../common/Toast.jsx'

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="18" fill="#8B2635" />
        <path d="M32 13 45 37H19Z" fill="#315747" />
        <path d="M32 22 50 50H14Z" fill="#3d6b58" />
        <rect x="29" y="50" width="6" height="5" rx="1" fill="#C4A46B" />
        <circle cx="32" cy="12" r="3.5" fill="#C4A46B" />
      </svg>
      <span className="font-serif text-lg font-bold tracking-tight text-burgundy">Christmas Stay</span>
    </span>
  )
}

export default function Header({ onSignOut }) {
  const { state, actions } = useStore()
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      await actions.refresh({ silent: true })
      toast.info('최신 내용을 불러왔어')
    } catch (err) {
      toast.error(err)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
        <Link to="/" className="shrink-0" aria-label="Christmas Stay 홈">
          <Logo />
        </Link>
        <div className="flex-1" />
        <DesktopNav />
        <div className="hidden lg:block">
          <TripDatePicker />
        </div>
        <button className="icon-btn text-muted" onClick={refresh} aria-label="다른 기기에서 바뀐 내용 새로 불러오기" title="새로 불러오기">
          <RefreshCw className={`size-[18px] ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <div className="hidden items-center gap-1 sm:flex">
          <span className="text-[13px] font-semibold text-ink/70">{state.me?.displayName}</span>
          <button className="icon-btn text-muted" onClick={onSignOut} aria-label="로그아웃" title="로그아웃">
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-3 lg:hidden md:px-6">
        <TripDatePicker />
      </div>
    </header>
  )
}
