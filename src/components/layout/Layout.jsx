import { Outlet, ScrollRestoration } from 'react-router-dom'
import Header from './Header.jsx'
import { MobileNav } from './Navigation.jsx'

export default function Layout({ onSignOut }) {
  return (
    <div className="min-h-dvh pb-24 md:pb-12">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        본문으로 건너뛰기
      </a>
      <Header onSignOut={onSignOut} />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 md:px-6 md:pt-8">
        <Outlet />
      </main>
      <MobileNav />
      <ScrollRestoration />
    </div>
  )
}
