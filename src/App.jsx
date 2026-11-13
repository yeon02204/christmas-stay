import { useCallback, useEffect, useMemo, useState } from 'react'
import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom'
import { Eye, LogOut, ServerCrash, ShieldAlert, Settings } from 'lucide-react'
import Layout from './components/layout/Layout.jsx'
import { Logo } from './components/layout/Header.jsx'
import { Spinner } from './components/common/fields.jsx'
import EmptyState from './components/common/EmptyState.jsx'
import HomePage from './pages/HomePage.jsx'
import StayFormPage from './pages/StayFormPage.jsx'
import StayDetailPage from './pages/StayDetailPage.jsx'
import RoomFormPage from './pages/RoomFormPage.jsx'
import RoomDetailPage from './pages/RoomDetailPage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import FavoritesPage from './pages/FavoritesPage.jsx'
import DataPage from './pages/DataPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { AppStoreProvider, useIsGuest, useStore } from './store/AppStore.jsx'
import { auth } from './services/api.js'
import { configError } from './services/supabaseClient.js'
import { clearGuest, loadGuest, saveGuest } from './services/guestSession.js'
import { SessionContext, useSession } from './store/session.js'


/** 구경 모드에서 열 수 없는 화면 (등록·수정·찜·데이터 관리) */
function MemberOnly({ children }) {
  const guest = useIsGuest()
  if (!guest) return children
  return (
    <EmptyState
      icon={Eye}
      title="구경 모드에서는 볼 수 없는 화면이야"
      description="숙소 목록·상세·비교는 볼 수 있어. 등록·수정은 로그인한 뒤에 해 줘."
      action={<Link to="/" className="btn-primary">숙소 보러 가기</Link>}
    />
  )
}
const memberOnly = (el) => <MemberOnly>{el}</MemberOnly>
const memberOnlyLazy = (load) => () => load().then((m) => ({ element: memberOnly(<m.default />) }))

function NotFound() {
  return <EmptyState icon={Settings} title="페이지를 찾을 수 없어" action={<Link to="/" className="btn-primary">홈으로</Link>} />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <LayoutWithSession />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'stays/new', element: memberOnly(<StayFormPage />) },
      // 자주 쓰지 않는 화면이라 열 때만 불러온다 (첫 화면 번들 크기 유지)
      { path: 'stays/import', lazy: memberOnlyLazy(() => import('./pages/BulkImportPage.jsx')) },
      { path: 'stays/booking-links', lazy: memberOnlyLazy(() => import('./pages/BookingLinksPage.jsx')) },
      { path: 'stays/:stayId', element: <StayDetailPage /> },
      { path: 'stays/:stayId/edit', element: memberOnly(<StayFormPage />) },
      { path: 'stays/:stayId/rooms/new', element: memberOnly(<RoomFormPage />) },
      { path: 'stays/:stayId/rooms/:roomId', element: <RoomDetailPage /> },
      { path: 'stays/:stayId/rooms/:roomId/edit', element: memberOnly(<RoomFormPage />) },
      { path: 'compare', element: <ComparePage /> },
      { path: 'favorites', element: memberOnly(<FavoritesPage />) },
      { path: 'data', element: memberOnly(<DataPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
])

function LayoutWithSession() {
  const { signOut } = useSession()
  return <Layout onSignOut={signOut} />
}

function FullScreen({ children }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">{children}</div>
}

function StoreGate() {
  const { status, error, actions } = useStore()
  const { signOut } = useSession()
  if (status === 'loading') return <FullScreen><Spinner label="우리의 숙소 목록을 불러오는 중" /></FullScreen>
  if (status === 'error') {
    const forbidden = error?.kind === 'forbidden'
    return (
      <FullScreen>
        <Logo />
        <div className="w-full max-w-md">
          <EmptyState
            compact
            icon={forbidden ? ShieldAlert : ServerCrash}
            title={forbidden ? '멤버로 등록되지 않은 계정이야' : '데이터를 불러오지 못했어'}
            description={forbidden ? 'Supabase 의 members 테이블에 이 계정을 추가해야 사용할 수 있어. (docs/SETUP.md 4단계)' : error?.message}
            action={
              <div className="flex gap-2">
                {!forbidden && <button className="btn-primary" onClick={() => actions.refresh()}>다시 시도</button>}
                <button className="btn-outline" onClick={signOut}><LogOut className="size-4" aria-hidden /> 로그아웃</button>
              </div>
            }
          />
        </div>
      </FullScreen>
    )
  }
  return <RouterProvider router={router} />
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [guest, setGuest] = useState(() => loadGuest()) // 비회원 구경 세션 { token, expiresAt } | null
  const [guestNotice, setGuestNotice] = useState(null)

  const endGuest = useCallback((notice = null) => {
    clearGuest()
    setGuest(null)
    setGuestNotice(notice)
  }, [])

  const guestExpired = useCallback(() => endGuest('구경 시간이 끝났어. 비밀번호를 다시 입력해 줘.'), [endGuest])
  const guestSession = useMemo(() => ({ signOut: () => endGuest() }), [endGuest])

  // 6시간이 지나면 자동으로 구경 모드 종료 (서버도 만료된 토큰을 거부함)
  useEffect(() => {
    if (!guest) return
    const t = setTimeout(() => endGuest('구경 시간(6시간)이 끝났어. 비밀번호를 다시 입력해 줘.'), Math.max(0, guest.expiresAt - Date.now()))
    return () => clearTimeout(t)
  }, [guest, endGuest])


  useEffect(() => {
    if (configError) return
    let alive = true
    // 회원으로 로그인돼 있으면 구경 세션은 정리
    const onSession = (s) => {
      if (s) {
        clearGuest()
        setGuest(null)
      }
      setSession(s ?? null)
    }
    auth.getSession().then((s) => alive && onSession(s))
    const off = auth.onChange(onSession)
    return () => {
      alive = false
      off()
    }
  }, [])

  const signOut = useCallback(async () => {
    await auth.signOut()
    setSession(null)
  }, [])

  if (configError) {
    return (
      <FullScreen>
        <Logo />
        <div className="card max-w-md p-6 text-sm leading-relaxed">
          <h1 className="font-serif text-lg font-bold">Supabase 연결 설정이 필요해</h1>
          <p className="mt-2 text-muted">{configError}</p>
          <p className="mt-3">
            프로젝트 폴더의 <code className="rounded bg-cream-deep px-1">.env.example</code> 을 <code className="rounded bg-cream-deep px-1">.env.local</code> 로 복사하고 값을 채운 뒤 개발 서버를 다시 실행해 줘.
            Vercel 에서는 Project Settings → Environment Variables 에 넣어 줘.
          </p>
        </div>
      </FullScreen>
    )
  }
  if (session === undefined) return <FullScreen><Spinner label="로그인 확인 중" /></FullScreen>
  if (!session && guest) {
    return (
      <SessionContext.Provider value={guestSession}>
        <AppStoreProvider key="guest" guest={guest} onAuthError={guestExpired}>
          <StoreGate />
        </AppStoreProvider>
      </SessionContext.Provider>
    )
  }
  if (!session)
    return (
      <LoginPage
        notice={guestNotice}
        onGuest={(g) => {
          saveGuest(g)
          setGuestNotice(null)
          setGuest(g)
          // 구경은 항상 홈에서 시작 (로그아웃 전 보던 회원 전용 화면에 머물지 않게)
          router.navigate('/', { replace: true })
        }}
      />
    )

  return (
    <SessionContext.Provider value={{ signOut }}>
      <AppStoreProvider key={session.user.id} onAuthError={signOut}>
        <StoreGate />
      </AppStoreProvider>
    </SessionContext.Provider>
  )
}
