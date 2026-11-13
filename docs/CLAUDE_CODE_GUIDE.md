# Claude Code 로 Christmas Stay 이어서 개발하기

## 이 키트에 들어 있는 것

| 파일 | 역할 | 언제 작동 |
|---|---|---|
| `CLAUDE.md` | 프로젝트 규칙 (가짜 데이터 금지, 미입력≠0원, 비밀 키 금지 …) | 매 세션 자동으로 읽음 |
| `.claude/skills/verify` | 빌드·테스트·린트 + 규칙 점검 | 커밋 전 자동, 또는 `/verify` |
| `.claude/skills/ship` | 검증 → 커밋 메시지 → git 명령어 (승인 후 실행) | `/ship` 으로 직접만 |
| `.claude/skills/new-migration` | DB 변경 절차 (SQL·RLS·api.js·문서) | DB 바꾸는 요청 시 자동, 또는 `/new-migration` |
| `.claude/skills/ui-change` | 디자인 토큰·공통 컴포넌트·모바일 규칙 | 화면 작업 시 자동 |
| `.claude/skills/supabase-check` | 실제 Supabase 상태 점검 (읽기 전용) | `/supabase-check` |
| `.claude/skills/browser-qa` | Playwright 로 PC/모바일 화면 확인 | `/browser-qa` |
| `.claude/agents/rules-reviewer` | 독립 코드 리뷰 (수정 안 함) | "rules-reviewer 로 리뷰해 줘" |
| `.claude/agents/rls-auditor` | SQL 보안 감사 | 새 마이그레이션 작성 시 |
| `.claude/settings.json` | 권한(빌드·테스트 자동 허용, 커밋·푸시는 확인, `.env.local` 읽기 금지) + 훅 | 항상 |
| `.claude/hooks/guard.mjs` | 초기 마이그레이션 수정·비밀 키·가짜 데이터 INSERT 를 **실행 전에 차단** | 파일 수정 직전 |
| `.claude/hooks/format.mjs` | 수정한 파일 Prettier 자동 정리 | 파일 수정 직후 |
| `.mcp.json` | Playwright MCP (브라우저 조작) | 프로젝트 열면 사용 승인 요청 |

---

## 0단계. 키트 설치 (1회)

1. 이 zip 을 `C:\dev6\christmas-stay` 에 풀기 (같은 폴더에 `CLAUDE.md`, `.claude\`, `.mcp.json`, `docs\CLAUDE_CODE_GUIDE.md` 가 생기면 정상)
2. 터미널:
   ```powershell
   cd C:\dev6\christmas-stay
   npm install
   npm install -D prettier
   ```
3. Supabase MCP 연결 (SETUP.md 2단계에서 프로젝트를 만든 뒤).
   **Project ref** 는 Supabase 대시보드 주소 `supabase.com/dashboard/project/<여기>` 또는 Project Settings 에 있어.
   ```powershell
   claude mcp add --scope local --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&read_only=true&features=database,docs,debugging"
   ```
   - `read_only=true` → Claude 가 DB 를 **읽기만** 가능. 쓰기는 항상 너가 SQL Editor 에서 실행.
   - `--scope local` → 이 PC 에만 저장 (git 에 안 올라감)
4. `claude` 실행 → `/mcp` 입력 → supabase 선택 → 브라우저에서 Supabase 로그인(OAuth) 승인
5. 처음 실행하면 `.mcp.json` 의 playwright 사용 여부를 물어봐 → 승인
6. 확인: `/mcp` 에 supabase ✔, playwright ✔ / `/skills` 에 verify, ship … 이 보이면 끝

> 맥이라면 `.mcp.json` 의 `"command": "cmd", "args": ["/c", "npx", ...]` 를 `"command": "npx", "args": ["@playwright/mcp@latest"]` 로 바꿔.

---

## Claude Code 잘 쓰는 법 (이 프로젝트 기준)

| 상황 | 방법 |
|---|---|
| 큰 작업 시작 전 | **Shift+Tab 두 번 → Plan 모드**. 계획을 먼저 받고 승인 후 실행 |
| 파일 지정 | `@src/pages/ComparePage.jsx` 처럼 `@` 로 파일을 찍어 주면 정확해져 |
| 작업 하나 끝나면 | `/clear` 로 대화 비우기 (규칙은 CLAUDE.md 에 있어서 안 잊어버림) |
| 대화가 길어지면 | `/compact` |
| 화면 확인 | "browser-qa 로 확인해 줘" |
| 커밋 | `/ship` |
| 독립 리뷰 | "rules-reviewer 서브에이전트로 지금 변경사항 리뷰해 줘" |
| 되돌리기 | Esc 두 번 → 이전 메시지로 되감기 (파일도 되돌릴 수 있음) |
| 이미지 붙여넣기 | 디자인 참고 스크린샷을 Ctrl+V 로 대화에 붙여넣으면 그걸 보고 작업 |

---

## 1단계. 프로젝트 파악 (첫 세션)

```
README.md, CLAUDE.md, docs/DATABASE.md, docs/SETUP.md 를 읽고 프로젝트를 파악해 줘.
그다음:
1. /skills 와 .claude/agents 에 어떤 도구가 준비돼 있는지 한 줄씩 요약
2. npm run build 와 npm test 를 돌려서 현재 상태 확인
3. README 의 "미검증" 항목을 보고, 내가 직접 해야 할 일과 너가 할 수 있는 일을 나눠서 순서대로 알려줘
코드는 아직 수정하지 마.
```

## 2단계. 실제 Supabase 연결 확인

(SETUP.md 2~5단계를 마치고 `.env.local` 을 채운 뒤)

```
/supabase-check
실제 Supabase 프로젝트가 supabase/migrations/20261113000000_init.sql 과 일치하는지 점검해 줘.
특히 RLS, anon 함수 실행 권한, stay-photos 버킷과 정책, members 가 2명인지 확인해.
불일치가 있으면 내가 SQL Editor 에서 실행할 수정 SQL 을 만들어 줘. 직접 쓰기 작업은 하지 마.
```

## 3단계. 실제 환경 동작 확인 (가장 중요)

`npm run dev` 를 다른 터미널에 띄워 두고:

```
/browser-qa
http://localhost:5173 을 열어 줘. 로그인은 내가 직접 할게, 로그인 화면이 뜨면 기다려.
로그인 후 아래를 실제 Supabase 로 확인해 줘. 테스트 데이터는 이름을 "[테스트]" 로 시작하고 끝나면 지워 줘.
1. [테스트] 숙소 등록 → 대표 사진 파일 업로드 → 저장
2. 객실 2개 등록: 사진 2장 업로드, 숙박비, 바비큐 금액, 필수 추가금 1개
3. 비교에 담고 바비큐 포함 토글 시 총비용이 바뀌는지
4. 새로고침 후 유지되는지
5. 숙소 삭제 → Storage 에서 사진도 지워졌는지 (supabase-check 로 storage.objects 개수 확인)
각 단계 PC/모바일 스크린샷과 콘솔 오류를 표로 정리해 줘. 문제가 있으면 원인과 고칠 방법만 먼저 보고해.
```

문제가 나왔다면:

```
방금 browser-qa 에서 나온 문제 중 [번호] 를 고쳐 줘.
Plan 모드로 원인과 수정 계획을 먼저 보여주고, 승인하면 수정 → verify → browser-qa 로 같은 단계만 다시 확인.
```

## 4단계. 내 실제 숙소 등록하면서 불편한 점 다듬기

숙소 2~3개를 직접 등록해 보고, 불편했던 점을 그대로 적어서:

```
숙소 정보를 직접 등록해 보니 이런 점이 불편했어:
- (예) 객실 폼이 길어서 가격 입력까지 스크롤이 많음
- (예) 사진 URL 을 하나씩 붙여넣기 귀찮음
- (예) 모바일에서 저장 버튼이 키보드에 가려짐
ui-change 스킬 기준으로 각 문제의 해결안을 2개씩 제안해 줘. 기능 추가는 최소로, 기존 컴포넌트 재사용 우선.
내가 고르면 그것만 구현하고 browser-qa 로 PC/모바일 확인해 줘.
```

## 5단계. 배포

```
/ship
지금까지 변경사항을 커밋하고 push 할 준비를 해 줘.
그다음 Vercel 배포 체크리스트(docs/SETUP.md 8단계)를 내 상황에 맞게 단계별로 다시 정리해 줘.
```

배포 후:

```
/browser-qa
배포 주소 https://<내주소>.vercel.app 에서 3단계와 같은 점검을 읽기 전용으로 해 줘 (데이터 생성 없이).
상세 페이지에서 새로고침했을 때 404 가 안 나는지도 확인해.
```

## 6단계. 휴대폰 실기기 확인 (너가 직접)

같은 와이파이에서:

```
개발 서버를 휴대폰에서 열 수 있게 실행하는 방법을 알려줘 (vite --host).
그리고 아이폰 사파리/안드로이드 크롬에서 내가 직접 확인할 체크리스트를 10개 이내로 만들어 줘
(사진 업로드, 갤러리 스와이프, 비교표 가로 스크롤, 키보드가 입력창 가리는지, 하단 메뉴 겹침 등).
```

결과를 알려준 뒤:

```
휴대폰에서 이런 문제가 있었어: (내용 + 스크린샷 Ctrl+V)
원인 분석 후 고쳐 줘. ui-change 규칙을 지키고 browser-qa 390px 로 확인.
```

---

## 나중에 기능을 더하고 싶을 때 (예시 프롬프트)

**DB 가 바뀌는 기능** — 예: 숙소별 "후기 링크" 여러 개 저장
```
숙소마다 후기 링크(제목+URL)를 여러 개 저장하고 숙소 상세에서 보고 싶어.
/new-migration 절차대로 Plan 모드로 설계부터 보여줘.
구현 후 rls-auditor 로 SQL 감사, rules-reviewer 로 코드 리뷰, verify 까지 하고
내가 SQL Editor 에서 실행할 파일을 알려줘.
```

**실시간 동기화** (지금은 창 복귀/새로고침 버튼으로 반영)
```
상대가 숙소를 수정하면 내 화면에 자동 반영되게 Supabase Realtime 을 붙이는 방안을 검토해 줘.
무료 플랜 한도, 필요한 마이그레이션(publication 설정), 변경 범위를 먼저 정리하고 구현은 내가 승인하면 해.
```

**사진 비공개**
```
stay-photos 버킷을 private 으로 바꾸고 signed URL 로 표시하도록 바꾸는 방안을 Plan 모드로 설계해 줘.
캐싱·만료·백업(JSON 내보내기)에 미치는 영향도 같이.
```

---

## 주의

- 훅(`guard.mjs`, `format.mjs`)은 Node 로 실행돼. 훅 오류 메시지가 계속 뜨면 `/hooks` 에서 확인하거나 `.claude/settings.json` 의 `hooks` 부분을 지워도 앱에는 영향 없어.
- Supabase MCP 는 **read_only** 로만 연결해. 쓰기 권한을 주면 Claude 가 실데이터를 바로 바꿀 수 있어.
- 이 키트의 훅·MCP 설정은 Windows 기준으로 작성했고 실제 너의 PC 에서는 아직 실행해 보지 않았어. 처음 쓸 때 `/mcp`, `/skills`, `/hooks` 로 정상 등록됐는지 확인해 줘.
