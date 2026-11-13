import { createClient } from '@supabase/supabase-js'

// 프론트엔드에는 공개용 키(publishable key, sb_publishable_... / 예전 이름: anon key)만 둔다.
// secret(service_role) 키는 RLS 를 우회하므로 절대 VITE_ 환경변수나 코드에 넣지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const PHOTO_BUCKET = 'stay-photos'

export const isSupabaseConfigured = Boolean(url && anonKey)

function looksLikeServiceRole(key) {
  if (!key) return false
  if (key.startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

export const configError = !isSupabaseConfigured
  ? 'Supabase 연결 정보(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았어.'
  : looksLikeServiceRole(anonKey)
    ? '프론트엔드 환경변수에 secret(service_role) 키가 들어 있어. Supabase 에서 해당 키를 즉시 폐기·재발급하고 publishable 키를 넣어 줘.'
    : null

export const supabase = isSupabaseConfigured && !configError
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'christmas-stay-auth' },
    })
  : null
