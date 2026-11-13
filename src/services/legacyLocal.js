// 이전 localStorage 버전 데이터 이전용 (읽기 전용)
// 이전 버전은 데이터를 localStorage('christmas-stay:data')에, 업로드 사진을 IndexedDB('christmas-stay-images')에 저장했다.

import { collectLocalImageIds, normalizeData } from '../utils/validation.js'

const LS_KEY = 'christmas-stay:data'
const IDB_NAME = 'christmas-stay-images'

export function hasLegacyData() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.stays) && parsed.stays.length > 0
  } catch {
    return false
  }
}

function readIdbImages(ids) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !ids.length) return resolve({})
    const req = indexedDB.open(IDB_NAME)
    req.onupgradeneeded = () => {
      // DB 가 없던 경우 — 새로 만들지 않고 종료
      req.transaction.abort()
      resolve({})
    }
    req.onerror = () => resolve({})
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('images')) {
        db.close()
        return resolve({})
      }
      const out = {}
      const t = db.transaction('images', 'readonly')
      const store = t.objectStore('images')
      ids.forEach((id) => {
        const g = store.get(id)
        g.onsuccess = () => g.result?.blob && (out[id] = g.result.blob)
      })
      t.oncomplete = () => {
        db.close()
        resolve(out)
      }
      t.onerror = () => {
        db.close()
        resolve(out)
      }
    }
  })
}

/** @returns {{ data, images, errors, warnings, missingImages }} */
export async function loadLegacyData() {
  let parsed
  try {
    parsed = JSON.parse(localStorage.getItem(LS_KEY))
  } catch {
    return { errors: ['브라우저에 저장된 이전 데이터를 읽을 수 없어'] }
  }
  const { data, errors, warnings } = normalizeData(parsed)
  if (!data) return { errors }
  const ids = [...collectLocalImageIds(data)]
  const images = await readIdbImages(ids)
  return { data, images, errors, warnings, missingImages: ids.filter((id) => !images[id]).length }
}

export function clearLegacyData() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
  try {
    indexedDB.deleteDatabase(IDB_NAME)
  } catch {
    /* ignore */
  }
}
