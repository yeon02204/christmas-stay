# Christmas Stay — Claude Code 작업 규칙

커플 두 명이 2026 크리스마스 글램핑 숙소를 함께 비교하는 개인용 웹사이트.
React 19 + Vite + Tailwind CSS 4 + React Router 7 + Supabase(PostgreSQL·Auth·Storage) + Vercel.
별도 백엔드 서버 없음. Edge Functions 도 쓰지 않음.

## 먼저 읽을 문서
- `README.md` — 기능 목록, 폴더 구조, 테스트 결과, 미검증 항목
- `docs/DATABASE.md` — 테이블, RLS, RPC 명세, 총비용 계산 규칙
- `docs/SETUP.md` — Supabase / Vercel 설정 절차 (사용자가 직접 하는 작업)

## 절대 규칙
1. **가짜 숙소 데이터 금지.** 시드·예시·테스트용이라도 실제 숙소처럼 보이는 데이터를 앱 기본값이나 DB 마이그레이션에 넣지 마.
2. **미입력은 미입력으로.** 가격 null 을 0원으로 취급하거나 최저가로 표시하지 마. 시설 정보가 없으면 '확인 필요'이지 '없음'이 아니야.
3. **날짜별 가격은 날짜별로.** 다른 날짜 구간의 가격·예약 가능 여부를 자동으로 가져와 보여주지 마.
4. **비밀 키 금지.** secret / service_role 키를 `VITE_` 변수, 코드, 커밋 어디에도 넣지 마. 프론트는 publishable 키만.
5. **DB 접근은 `src/services/api.js` 를 통해서만.** 컴포넌트에서 supabase 클라이언트를 직접 호출하지 마. 쓰기는 RPC 함수로.
6. **DB 변경은 새 마이그레이션 파일로.** `supabase/migrations/20261113000000_init.sql` 은 이미 적용된 파일이니 수정하지 말고, `supabase/migrations/YYYYMMDDHHMMSS_설명.sql` 을 새로 만들어. RLS 정책도 함께 작성해.
7. **`supabase/tests/`, `scripts/mock-supabase/` 는 로컬 테스트 전용.** 실제 Supabase 에 적용하는 안내를 하지 마.
8. 요청하지 않은 기능을 임의로 추가하지 마. 필요해 보이면 먼저 제안만 해.

## 코드 스타일
- JS(JSX), 세미콜론 없음, 작은따옴표, 2칸 들여쓰기 (`.prettierrc`)
- 색상은 `src/index.css` 의 테마 토큰 사용: cream, burgundy, pine, gold, ink, muted, line …
  공통 클래스: `card`, `btn-primary`, `btn-outline`, `btn-ghost`, `btn-sm`, `input`, `chip`, `field-label`, `section-title`, `muted-na`
  (Tailwind 4 `@utility` 로 정의돼 있음. 새 공통 클래스도 `@utility` 로 추가)
- 아이콘은 `lucide-react`
- UI 문구는 반말·친근한 톤 (예: "저장했어", "확인 필요")
- 모바일 390px 에서 가로 넘침이 없어야 함. 하단 고정 내비(약 64px)를 가리지 않게.
- 접근성: 버튼에 aria-label, 입력에 label, 다이얼로그는 `ConfirmDialog`(네이티브 dialog) 사용

## 확인 방법
- `npm run build` 와 `npm test` 는 변경할 때마다 통과해야 해.
- 실제 Supabase 연결이 필요한 확인은 사용자에게 무엇을 눌러 보면 되는지 체크리스트로 알려 줘.
- 작업을 마치면 바뀐 파일 목록과 **git 커밋 명령어**(`git add` / `git commit -m "..."` / `git push`)를 함께 알려 줘.
