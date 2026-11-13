import { GitCompareArrows, Heart } from 'lucide-react'
import { useDerived, useStore } from '../../store/AppStore.jsx'
import { useToast } from '../common/Toast.jsx'

export function FavoriteButton({ room, size = 'md', withLabel = false }) {
  const { actions } = useStore()
  const { favoriteIds } = useDerived()
  const toast = useToast()
  const on = favoriteIds.has(room.id)

  async function toggle(e) {
    e.preventDefault()
    e.stopPropagation()
    try {
      const added = await actions.toggleFavorite(room.id)
      toast.success(added ? `"${room.name}" 찜했어` : '찜을 해제했어')
    } catch (err) {
      toast.error(err)
    }
  }
  const dim = size === 'sm' ? 'size-9' : 'size-10'
  if (withLabel) {
    return (
      <button type="button" onClick={toggle} className={on ? 'btn bg-burgundy-soft text-burgundy' : 'btn-outline'} aria-pressed={on}>
        <Heart className={`size-4 ${on ? 'fill-burgundy' : ''}`} aria-hidden />
        {on ? '찜함' : '찜하기'}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `${room.name} 찜 해제` : `${room.name} 찜하기`}
      className={`inline-flex ${dim} items-center justify-center rounded-full transition-colors ${on ? 'bg-burgundy-soft text-burgundy' : 'bg-white text-muted hover:text-burgundy'} shadow-soft`}
    >
      <Heart className={`size-[18px] ${on ? 'fill-burgundy' : ''}`} />
    </button>
  )
}

export function CompareButton({ room, withLabel = false, size = 'md' }) {
  const { state, actions } = useStore()
  const toast = useToast()
  const on = state.compare.includes(room.id)

  async function toggle(e) {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await actions.toggleCompare(room.id)
      if (res.full) toast.info('비교는 최대 3개까지야. 비교 목록에서 하나를 빼 줘.')
      else toast.success(res.added ? `비교 목록에 추가했어 (${state.compare.length + 1}/3)` : '비교 목록에서 뺐어')
    } catch (err) {
      toast.error(err)
    }
  }
  if (withLabel) {
    return (
      <button type="button" onClick={toggle} className={on ? 'btn bg-pine-soft text-pine' : 'btn-outline'} aria-pressed={on}>
        <GitCompareArrows className="size-4" aria-hidden />
        {on ? '비교 중' : '비교 담기'}
      </button>
    )
  }
  const dim = size === 'sm' ? 'size-9' : 'size-10'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `${room.name} 비교에서 빼기` : `${room.name} 비교에 담기`}
      title={on ? '비교에서 빼기' : '비교에 담기'}
      className={`inline-flex ${dim} items-center justify-center rounded-full shadow-soft transition-colors ${on ? 'bg-pine text-white' : 'bg-white text-muted hover:text-pine'}`}
    >
      <GitCompareArrows className="size-[18px]" />
    </button>
  )
}
