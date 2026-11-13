---
name: new-migration
description: Supabase DB 스키마 변경(테이블·컬럼·RPC 함수·RLS 정책 추가/수정)이 필요할 때 사용. 새 마이그레이션 SQL 작성, RLS, api.js·store 연결, 문서 갱신까지 한 번에 처리한다.
---

# new-migration — DB 변경 절차

## 원칙
- `supabase/migrations/20261113000000_init.sql` 은 **수정 금지** (이미 적용됨).
- 새 파일: `supabase/migrations/<YYYYMMDDHHMMSS>_<짧은_설명>.sql` (현재 시각 기준)
- 숙소/객실 데이터를 INSERT 하지 마.

## 1. 설계 먼저
변경 전에 사용자에게 짧게 보여줘:
- 바뀌는 테이블/컬럼/함수
- 공유 데이터인지(두 멤버 모두 수정) / 개인 데이터인지(user_id = auth.uid())
- 기존 데이터에 미치는 영향 (기본값, null 허용 여부)

## 2. SQL 작성 규칙
- 재실행 안전하게: `create table if not exists`, `add column if not exists`, `create or replace function`, `drop policy if exists` 후 `create policy`
- 새 테이블:
  ```sql
  alter table public.<t> enable row level security;
  -- 공유 데이터
  create policy <t>_members_all on public.<t> for all to authenticated
    using (public.is_member()) with check (public.is_member());
  -- 개인 데이터
  create policy <t>_own on public.<t> for all to authenticated
    using (user_id = auth.uid() and public.is_member())
    with check (user_id = auth.uid() and public.is_member());
  grant select, insert, update, delete on public.<t> to authenticated;
  ```
- 금액은 `integer check (x >= 0)`, 미입력은 `null`. URL 은 `~* '^https?://'` 체크.
- RPC 함수: `language plpgsql set search_path = public` (security invoker 기본), 첫 줄에 `perform public._require_member();`
  끝에 `revoke all on function ... from anon, public; grant execute on function ... to authenticated;`
- 반환 JSON 은 camelCase (기존 `_room_json` 형식 참고).
- 저장 함수가 사진 경로를 버리면 `removedPaths` 로 돌려줘.

## 3. 프론트 연결
1. `src/services/api.js` 에 함수 추가 (에러는 기존 `rpc()` 헬퍼로)
2. `src/store/AppStore.jsx` 의 `transformState` / `actions` 갱신
3. 필요하면 `src/utils/models.js` 기본값, `src/utils/validation.js` 검증, `normalizeData`(백업 호환) 갱신
4. `import_backup` 함수가 새 필드를 복원해야 하면 새 마이그레이션에서 `create or replace` 로 갱신

## 4. 문서·검증
- `docs/DATABASE.md` 의 테이블/RLS/RPC 표 갱신
- Supabase MCP 가 연결돼 있으면 (read-only) `list_tables` 등으로 현재 스키마와 충돌 없는지 확인
- `verify` 스킬 실행
- 마지막에 사용자에게 안내:
  > Supabase **SQL Editor** 에서 `<새 파일>` 내용을 실행해 줘. 실행 후 앱에서 ○○ 화면을 확인하면 돼.

## 5. RLS 점검
작업 끝에 `rls-auditor` 서브에이전트로 새 SQL 을 검토받아.
