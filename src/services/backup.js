// JSON 백업 / 복원 (이전 localStorage 버전 데이터 이전 포함)
//
// 백업 파일 형식 (app: 'christmas-stay', schemaVersion: 1)
//   data.stays / data.rooms / data.favorites / data.compare / data.compareOptions / data.trip
//   data.rooms[].ratings  → 내보낸 사람의 평가. 가져오는 사람의 평가로 복원된다.
//   images: { [id]: { type, dataUrl } }  → '사진 파일 포함' 선택 시에만. 사진 참조는 { type:'local', id }
// 사진 처리
//   · URL 로 등록한 사진: 주소만 저장 → 항상 복원됨
//   · 업로드한 사진(사진 파일 포함 O): 파일이 JSON 안에 들어가고, 가져올 때 Storage 에 다시 업로드
//   · 업로드한 사진(사진 파일 포함 X): Storage 경로만 저장 → 같은 Supabase 프로젝트에서만 복원됨

import { SCHEMA_VERSION } from '../utils/models.js'
import { RATING_CRITERIA } from '../utils/models.js'
import { collectLocalImageIds, validateBackup } from '../utils/validation.js'
import { api } from './api.js'
import { blobToDataUrl, dataUrlToBlob } from './imageProcessing.js'
import { photoUrl, removePhotos, uploadPhoto } from './photos.js'

export async function buildBackup(state, { includePhotos }) {
  const myRatings = state.ratingsByUser[state.me.id] || {}
  const images = {}
  let failed = 0
  let counter = 0

  async function convert(ref) {
    if (!includePhotos || ref?.type !== 'storage') return ref
    try {
      const res = await fetch(photoUrl(ref))
      if (!res.ok) throw new Error()
      const id = `img_${++counter}`
      const blob = await res.blob()
      images[id] = { type: blob.type, dataUrl: await blobToDataUrl(blob) }
      return { type: 'local', id }
    } catch {
      failed++
      return ref
    }
  }

  const stays = []
  for (const s of state.stays) {
    stays.push({ ...s, coverImage: s.coverImage ? await convert(s.coverImage) : null })
  }
  const rooms = []
  for (const r of state.rooms) {
    const imgs = []
    for (const img of r.images) imgs.push(await convert(img))
    const ratings = Object.fromEntries(RATING_CRITERIA.map((c) => [c.key, myRatings[r.id]?.[c.key] ?? null]))
    rooms.push({ ...r, images: imgs, ratings })
  }

  const payload = {
    app: 'christmas-stay',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: state.me.displayName,
    includesPhotos: !!includePhotos,
    data: {
      schemaVersion: SCHEMA_VERSION,
      stays,
      rooms,
      favorites: state.favorites,
      compare: state.compare,
      compareOptions: state.compareOptions,
      trip: state.trip,
    },
  }
  if (includePhotos) payload.images = images
  return { payload, failed }
}

export function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  a.href = url
  a.download = `christmas-stay-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function parseBackupFile(file) {
  if (file.size > 100 * 1024 * 1024) return { errors: ['파일이 너무 커 (최대 100MB)'] }
  let json
  try {
    json = JSON.parse(await file.text())
  } catch {
    return { errors: ['JSON 파일을 읽을 수 없어. 파일이 손상되었거나 JSON 형식이 아니야.'] }
  }
  return validateBackup(json)
}

/**
 * 검증된 백업을 Supabase 에 반영한다.
 * images: { [localId]: { dataUrl } | Blob }
 * 1) 로컬 사진 업로드 → 2) import_backup RPC (트랜잭션) → 3) 더 이상 쓰지 않는 기존 사진 삭제
 * 2) 가 실패하면 1) 에서 올린 사진을 지우고 기존 데이터는 그대로 유지된다.
 */
export async function runImport({ data, images = {} }, onProgress = () => {}) {
  const uploaded = []
  let droppedPhotos = 0
  const localIds = [...collectLocalImageIds(data)]
  const refMap = {}
  let done = 0
  for (const id of localIds) {
    const src = images[id]
    if (!src) {
      droppedPhotos++
      continue
    }
    const blob = src instanceof Blob ? src : await dataUrlToBlob(src.dataUrl)
    try {
      const ref = await uploadPhoto(blob, 'rooms')
      refMap[id] = ref
      uploaded.push(ref.path)
    } catch {
      droppedPhotos++
    }
    onProgress(`사진 업로드 ${++done}/${localIds.length}`)
  }
  const mapRef = (ref) => (ref?.type === 'local' ? refMap[ref.id] || null : ref)
  const prepared = {
    ...data,
    stays: data.stays.map((s) => ({ ...s, coverImage: mapRef(s.coverImage) })),
    rooms: data.rooms.map((r) => ({ ...r, images: r.images.map(mapRef).filter(Boolean) })),
  }

  onProgress('데이터 저장 중')
  let result
  try {
    result = await api.importBackup(prepared)
  } catch (err) {
    await removePhotos(uploaded)
    throw err
  }
  // 새 데이터가 계속 참조하는 경로는 지우지 않는다
  const stillUsed = new Set()
  prepared.stays.forEach((s) => s.coverImage?.type === 'storage' && stillUsed.add(s.coverImage.path))
  prepared.rooms.forEach((r) => r.images.forEach((i) => i.type === 'storage' && stillUsed.add(i.path)))
  await removePhotos((result.removedPaths || []).filter((p) => !stillUsed.has(p)))
  return { ...result, droppedPhotos }
}
