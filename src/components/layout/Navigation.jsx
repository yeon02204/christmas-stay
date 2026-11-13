import { NavLink } from 'react-router-dom'
import { Database, GitCompareArrows, Heart, Home } from 'lucide-react'
import { useStore } from '../../store/AppStore.jsx'

export function useNavItems() {
  const { state } = useStore()
  return [
    { to: '/', label: '홈', icon: Home, end: true },
    { to: '/favorites', label: '찜', icon: Heart, count: state.favorites.length },
    { to: '/compare', label: '비교', icon: GitCompareArrows, count: state.compare.length, max: 3 },
    { to: '/data', label: '데이터', icon: Database },
  ]
}

export function DesktopNav() {
  const items = useNavItems()
  return (
    <nav aria-label="주요 메뉴" className="hidden items-center gap-1 md:flex">
      {items.map(({ to, label, icon: Icon, count, end, max }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
              isActive ? 'bg-burgundy text-white' : 'text-ink/70 hover:bg-cream-deep hover:text-ink'
            }`
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
          {count > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">
              {count}
              {max ? `/${max}` : ''}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function MobileNav() {
  const items = useNavItems()
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ to, label, icon: Icon, count, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                  isActive ? 'text-burgundy' : 'text-muted'
                }`
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
              {count > 0 && (
                <span className="absolute right-[calc(50%-20px)] top-1.5 min-w-4 rounded-full bg-burgundy px-1 text-center text-[10px] leading-4 text-white tabular-nums">
                  {count}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
