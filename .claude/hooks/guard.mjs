// PreToolUse 훅: 파일을 쓰기 전에 프로젝트 규칙 위반을 막는다.
// exit 2 + stderr 메시지 → Claude 에게 이유가 전달되고 해당 편집이 차단된다.
import { readFileSync } from 'node:fs'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}
const t = input.tool_input || {}
const file = String(t.file_path || '').replace(/\\/g, '/')
const text = [t.content, t.new_string, ...(Array.isArray(t.edits) ? t.edits.map((e) => e.new_string) : [])]
  .filter(Boolean)
  .join('\n')

function block(msg) {
  process.stderr.write(`[guard] ${msg}\n`)
  process.exit(2)
}

// 1) 이미 적용된 초기 마이그레이션은 수정 금지
if (/supabase\/migrations\/20261113000000_init\.sql$/.test(file)) {
  block('초기 마이그레이션은 이미 Supabase 에 적용된 파일이라 수정할 수 없어. supabase/migrations/ 에 새 타임스탬프 파일을 만들어 줘.')
}

// 2) 비밀 키가 코드에 들어가는 것 차단 (.env.example 의 빈 값은 허용)
if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) block('secret 키(sb_secret_...)는 코드나 문서에 넣을 수 없어.')
if (/VITE_[A-Z_]*(SECRET|SERVICE_ROLE)/.test(text))
  block('VITE_ 로 시작하는 변수는 브라우저에 공개돼. secret / service_role 키를 VITE_ 변수로 만들 수 없어.')
for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
  try {
    const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString())
    if (payload.role === 'service_role') block('service_role JWT 를 파일에 넣을 수 없어.')
  } catch {
    /* JWT 가 아니면 무시 */
  }
}

// 3) 마이그레이션에 가짜 숙소 데이터 INSERT 금지
if (/supabase\/migrations\/.*\.sql$/.test(file) && /insert\s+into\s+(public\.)?(stays|rooms|room_rates|room_images|room_extras)\b/i.test(text)) {
  block('마이그레이션에 숙소/객실 데이터를 넣을 수 없어 (가짜 데이터 금지 규칙).')
}

process.exit(0)
