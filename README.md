# 🎄 Christmas Stay

2026 크리스마스 글램핑·숙소를 둘이 함께 비교하고 고르는 개인용 웹사이트.

- **Frontend**: React 19 + Vite + Tailwind CSS 4 + React Router + Lucide
- **Backend**: Supabase (PostgreSQL · Auth · Storage · RPC) — 별도 서버 없음
- **배포**: Vercel (무료) + Supabase (무료)

👉 **처음이라면 [docs/SETUP.md](docs/SETUP.md) 부터** (Supabase 생성 → SQL 실행 → 계정 → 환경변수 → 실행 → Vercel)

## 기능

| 화면 | 기능 |
|---|---|
| 홈 | 숙소 카드(대표사진·유형·지역·객실 수·최저가/가격 미입력), 숙소명 검색, **숙소 유형·지역 칩 필터**(개수 표시, 함께 조합), 가격순·최근순 정렬, 찜한 객실만, 카드에서 바로 찜·비교 담기, 빈 화면 |
| 숙소 등록/수정 | 숙소명만 필수, 숙소 유형(글램핑·풀빌라·카라반·캠핑·펜션·호텔·복합·기타), 대표사진(URL/업로드), 저장하면 바로 객실 추가로 이동, 삭제(영향 범위 확인창) |
| 숙소 일괄 등록 | JSON(ChatGPT 답변 그대로 가능)으로 숙소 여러 개 + 객실·날짜별 가격·추가금·시설·분위기·사진 URL·예약 링크 한 번에 등록, 저장 전 미리보기, 오류 위치 표시(숙소 › 객실 › 항목), 같은 이름 숙소 중복 등록 차단(저장 직전 재확인), 숙소 단위 실패 시 해당 숙소만 되돌림 |
| 예약 링크 일괄 업데이트 | 데이터 화면에서 진입. `[{ stayName, bookingUrl }]` JSON(붙여넣기/파일)으로 **이미 등록된 숙소의 예약 링크만** 변경. 숙소명 표기 차이(지역·띄어쓰기·특수문자·글램핑/펜션 등)와 주소·예약 페이지·홈페이지·지역을 함께 비교해 **후보가 하나로 확실할 때만** 자동 연결(근거·최종 DB 숙소 표시), 애매하면 사용자가 직접 선택. 새 숙소 생성 안 함, 숙소의 모든 객실에 같은 링크. 저장 전 미리보기(기존→새 링크), 이름 불일치(비슷한 이름 후보)·중복 매칭·잘못된 항목은 자동 수정 안 하고 따로 표시, 성공/실패 건수 |
| 객실 등록/수정 | 객실명만 필수, **날짜 구간별** 숙박비·예약 가능 여부·확인일, 다른 날짜 가격 복사(예약 여부는 ‘확인 전’으로), 추가금(공통 기본값 + 날짜별 금액, 필수/선택), 총비용 미리보기, 사진 여러 장(URL 여러 줄 붙여넣기·파일·드래그·Ctrl+V), 시설 14종 3단계, 분위기 4항목, 이용 정보, **저장하고 다음 객실** |
| 숙소 상세 | 대표사진, 주소 복사, 홈페이지, 메모, 객실 카드(사진 갤러리·가격·예약 여부·주요 시설·평가) |
| 객실 상세 | 사진 갤러리(스와이프·키보드·썸네일), 총비용 계산기, 시설·분위기·이용 정보, 날짜별 가격표, 내 평가 5항목 / 상대 평가 |
| 비교 | 최대 3개, 같은 날짜·조건(바비큐/불멍/기타 추가금)으로 총비용, 가장 저렴 표시, 차이 강조, 대상 변경·제거, 장단점(공유), 모바일 가로 스크롤 |
| 찜 | 순위 지정, 개인 메모, 가격·예약 여부·평가, 비교 담기 |
| 데이터 | JSON 백업(사진 포함 선택)·복원, 이전 localStorage 데이터 이전, 예약 링크 일괄 업데이트, 구경 비밀번호 관리, 로그아웃 |
| 비회원 구경 | 로그인 화면의 '비회원으로 구경하기' → 4자리 비밀번호(서버에서 확인) → 숙소·객실·사진·가격·추가금·검색·필터·비교 **조회만**. 등록·수정·삭제·찜·평가·일괄 등록·데이터 관리는 숨김+주소 차단+서버 차단. 6시간 유지, 브라우저 닫으면 재입력, '구경 끝내기'. 비교·여행 날짜는 그 화면에서만 바뀌고 저장 안 됨 |

**공유 vs 개인**: 숙소·객실·가격·장단점·여행 날짜는 두 사람이 함께 수정. 찜·메모·순위·비교 목록·평가는 사용자별(평가는 서로 조회 가능).
동시 편집은 실시간이 아니라 **창으로 돌아올 때 / 새로고침 버튼**으로 반영되고, 같은 항목을 동시에 저장하면 충돌을 감지해 확인창을 띄워.

## 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (docs/SETUP.md 5단계)
npm run dev                  # http://localhost:5173
npm run build                # 배포용 빌드
npm test                     # 단위 테스트
```

VS Code 에서는 **F5** 로 바로 실행·디버깅돼 (`.vscode/` 설정 포함).

## 폴더 구조

```
src/
  components/
    common/    Toast, ConfirmDialog, EmptyState, Photo, ImagePicker, fields(입력 컴포넌트), UnsavedDialog
    layout/    Header, Navigation(PC 상단/모바일 하단), TripDatePicker, Layout
    stay/      StayCard, DeleteStayButton
    room/      RoomCard, ImageGallery, RatesEditor, RoomActions, roomDisplay, DeleteRoomButton
    compare/   CompareTable, PriceCalculator
  pages/       Home, StayForm, BulkImport(일괄 등록), StayDetail, RoomForm, RoomDetail, Compare, Favorites, Data, Login
  store/       AppStore(상태·액션), session
  services/    supabaseClient, api(RPC), photos(Storage), backup, legacyLocal, imageProcessing, bulkImport(일괄 등록 실행·되돌리기)
  hooks/       useUnsavedGuard, useFormHelpers
  utils/       models, price(총비용), date, validation, bulkImport(일괄 등록 JSON 검사)
supabase/
  migrations/  ← Supabase SQL Editor 에서 실행할 파일
  tests/       ← 로컬 테스트 전용 (실서비스에서 실행 금지)
scripts/
  mock-supabase/  로컬 테스트용 Supabase 대역 서버
  e2e/            Playwright 시나리오 테스트
docs/          SETUP.md(설정 가이드), DATABASE.md(DB·RLS·API 명세)
```

## 테스트

| 종류 | 방법 | 결과 (2026-11-14) |
|---|---|---|
| 빌드 | `npm run build` | ✅ 성공 |
| 단위 테스트 | `npm test` (총비용 계산, 금액 입력, 평가 요약, 백업 검증) | ✅ 45/45 (일괄 등록 JSON 검사·되돌리기·주소 중복, 숙소 유형, 예약 링크 매칭 포함) |
| DB·RLS | 로컬 PostgreSQL 16 + Supabase 대역 스키마에 마이그레이션 적용 → `supabase/tests/10·30·40·50_*.sql` | ✅ 21 + 4 + 3 + 3 (예약 링크 함수가 링크 외 데이터 0건 변경, 멤버 A/B/비멤버/anon 권한, 제약조건, cascade, 충돌 감지, 백업 복원, members 컬럼 권한, 추가금 보존, 권한 매트릭스, 숙소 유형). 마이그레이션 2회 연속 실행·기존 데이터 위에 실행해도 데이터 유지 |
| E2E | 로컬 PostgreSQL + `scripts/mock-supabase`(실제 supabase-js 로 호출) + 크롬 → `scripts/e2e/e2e_test.py` | ✅ 23/23 시나리오 (PC 1280px · 모바일 390px, 두 사용자) |

### 미검증 (외부 연결 정보가 없어 확인하지 못한 부분)

- **실제 Supabase 클라우드 프로젝트**에서의 SQL 실행, Auth 로그인, Storage 업로드
  (로컬에서는 같은 SQL 을 PostgreSQL 16 에 적용하고, Auth/Storage 는 대역 서버로 흉내 냈어. 실제 Supabase 의 `storage` 스키마·권한 세부는 다를 수 있어)
- Vercel 실배포, 실제 모바일 기기(iOS Safari / Android Chrome)
- 외부 사진 URL 표시 (테스트 환경에서 외부 접속이 막혀 있어 “사진을 불러올 수 없어” 대체 화면만 확인)
- Pretendard / Gowun Batang 웹폰트 로딩 (테스트 환경에서 CDN 차단 → 기본 글꼴로 확인)

### 로컬 E2E 재실행 (선택, Linux/macOS + PostgreSQL 필요)

```bash
createdb cs_test
psql -d cs_test -f supabase/tests/00_local_supabase_stub.sql -f supabase/migrations/20261113000000_init.sql -f supabase/migrations/20261114000000_stay_type.sql -f supabase/migrations/20261114010000_booking_link_update.sql -f supabase/migrations/20261114020000_guest_view.sql
psql -d cs_test -f supabase/tests/10_rls_and_rpc_test.sql -f supabase/tests/30_hardening_test.sql -f supabase/tests/40_stay_type_test.sql -f supabase/tests/20_reset_test_data.sql -f supabase/tests/50_booking_link_test.sql   # DB 테스트 (60_guest_test.sql 은 10번 데이터가 있는 상태에서)
psql -d cs_test -f supabase/tests/20_reset_test_data.sql       # 테스트 계정 준비
DATABASE_URL=postgres://... npm run mock:supabase              # :54321
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=local npm run dev
pip install playwright && python3 scripts/e2e/e2e_test.py      # 사진: /tmp/e2e/*.jpg 필요
```

## Claude Code 로 이어서 작업할 때

이 폴더를 VS Code 로 열고 Claude Code 에 이렇게 시작하면 맥락을 빨리 잡아:

> README.md 와 docs/DATABASE.md 를 읽고 구조를 파악해 줘. DB 변경이 필요하면 `supabase/migrations/` 에 새 SQL 파일을 추가하고(기존 파일 수정 X), 프론트는 `src/services/api.js` 를 통해서만 DB 를 호출해 줘.
