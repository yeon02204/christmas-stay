// 사진 저장소 (Supabase Storage, 공개 버킷 'stay-photos')
import { PHOTO_BUCKET, supabase } from './supabaseClient.js'
import { compressImage } from './imageProcessing.js'

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function newPath(folder, type) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${folder}/${id}.${EXT[type] || 'jpg'}`
}

export function photoUrl(ref) {
  if (!ref) return null
  if (ref.type === 'url') return ref.url
  if (ref.type === 'storage') return supabase?.storage.from(PHOTO_BUCKET).getPublicUrl(ref.path).data.publicUrl ?? null
  return null
}

/** 압축 후 업로드. 성공 시 { type: 'storage', path } 반환, 실패 시 사람이 읽을 수 있는 메시지로 throw */
export async function uploadPhoto(fileOrBlob, folder = 'rooms') {
  const blob = fileOrBlob instanceof File ? await compressImage(fileOrBlob) : fileOrBlob
  const contentType = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg'
  const path = newPath(folder, contentType)
  let res
  try {
    res = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '31536000' })
  } catch {
    throw new Error('사진 업로드 중 연결이 끊겼어. 다시 시도해 줘.')
  }
  if (res.error) {
    const m = res.error.message || ''
    if (/exceeded|too large|size/i.test(m)) throw new Error('사진이 너무 커 (최대 5MB)')
    if (/mime/i.test(m)) throw new Error('JPG, PNG, WEBP 사진만 올릴 수 있어')
    if (/row-level security|unauthorized|403/i.test(m)) throw new Error('사진을 올릴 권한이 없어 (멤버 계정인지 확인해 줘)')
    if (/quota|storage limit/i.test(m)) throw new Error('Supabase 저장 공간 한도를 초과했어')
    throw new Error(`사진 업로드 실패: ${m}`)
  }
  return { type: 'storage', path }
}

/** Storage 파일 삭제 (실패해도 앱 동작에는 영향 없음 → 조용히 무시) */
export async function removePhotos(paths) {
  const list = (paths || []).filter(Boolean)
  if (!list.length || !supabase) return
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove(list)
  } catch {
    /* ignore */
  }
}
