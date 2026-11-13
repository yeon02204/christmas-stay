import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * 저장하지 않은 입력이 있을 때 페이지 이동 / 새로고침 / 탭 닫기를 막는다.
 * 반환된 allowNext() 를 저장 직후 호출하면 다음 이동 1회는 막지 않는다.
 */
export function useUnsavedGuard(dirty) {
  const skip = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !skip.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return {
    blocker,
    allowNext() {
      skip.current = true
    },
  }
}
