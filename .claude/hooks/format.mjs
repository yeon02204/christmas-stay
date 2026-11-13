// PostToolUse 훅: Claude 가 수정한 파일을 Prettier 로 정리한다.
// prettier 가 설치돼 있지 않거나 실패해도 작업을 막지 않는다 (항상 exit 0).
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const file = input.tool_input?.file_path
  if (!file || !/\.(jsx?|mjs|css|json|md)$/.test(file) || /node_modules|package-lock\.json/.test(file)) process.exit(0)
  const bin = join(process.cwd(), 'node_modules', 'prettier', 'bin', 'prettier.cjs')
  if (!existsSync(bin)) process.exit(0)
  execFileSync(process.execPath, [bin, '--write', '--log-level', 'silent', file], { stdio: 'ignore', timeout: 15000 })
} catch {
  /* 무시 */
}
process.exit(0)
