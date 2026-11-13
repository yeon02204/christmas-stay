import { useEffect, useRef } from 'react'
import { removePhotos } from '../services/photos.js'

/**
 * 폼에서 새로 업로드한 사진 관리.
 * - 저장하지 않고 나가면 업로드한 사진을 Storage 에서 지운다.
 * - 저장하면 최종 사진 목록에 없는(중간에 뺀) 업로드만 지운다.
 */
export function useUploadTracker() {
  const uploaded = useRef([])
  const committed = useRef(false)

  useEffect(
    () => () => {
      if (!committed.current && uploaded.current.length) removePhotos(uploaded.current)
    },
    [],
  )

  return {
    track(path) {
      uploaded.current.push(path)
    },
    commit(keptPaths) {
      const keep = new Set(keptPaths)
      removePhotos(uploaded.current.filter((p) => !keep.has(p)))
      uploaded.current = []
      committed.current = true
    },
  }
}

export const storagePaths = (images) => images.filter((i) => i?.type === 'storage').map((i) => i.path)

export function isEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
