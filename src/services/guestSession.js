// 비회원 구경 세션: 서버가 발급한 6시간 토큰을 sessionStorage 에 둔다.
// sessionStorage 는 브라우저(탭)를 닫으면 지워져서, 다시 열면 비밀번호를 다시 입력해야 한다.
// 토큰은 서버가 서명·만료를 검사하므로 여기 값을 고쳐도 권한이 생기지 않는다.

const KEY = 'christmas-stay-guest'

export function loadGuest() {
  try {
    const g = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (g && typeof g.token === 'string' && typeof g.expiresAt === 'number' && g.expiresAt > Date.now()) return g
  } catch {
    /* 저장소 사용 불가 → 게스트 아님 */
  }
  clearGuest()
  return null
}

export function saveGuest(g) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token: g.token, expiresAt: g.expiresAt }))
  } catch {
    /* 저장 실패해도 이번 화면에서는 동작 */
  }
}

export function clearGuest() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}
