---
name: supabase-check
description: 실제 Supabase 프로젝트 상태 점검. Supabase MCP(read-only)로 테이블·RLS·정책·함수·Storage 버킷·멤버 수가 마이그레이션과 일치하는지 확인하고 로그에서 오류를 찾는다. "Supabase 연결 확인", "DB 제대로 됐는지 봐 줘", 실서비스 오류 조사 시 사용.
---

# supabase-check — 실제 Supabase 점검 (읽기 전용)

전제: Supabase MCP 가 `read_only=true` 와 `project_ref` 로 연결돼 있어야 해. 없으면 `docs/CLAUDE_CODE_GUIDE.md` 의 MCP 설정 명령을 안내하고 멈춰.
**어떤 경우에도 데이터를 쓰거나 지우는 SQL 을 실행하지 마.** 수정이 필요하면 SQL 을 만들어서 사용자에게 SQL Editor 실행을 요청해.

## 점검 항목
1. 테이블 목록: `members, stays, rooms, room_images, room_extras, room_rates, rate_extra_prices, trip_settings, favorites, ratings, compare_items, user_settings, compare_extra_selections` 이 모두 있는지
2. RLS: 위 테이블 모두 `relrowsecurity = true`
   ```sql
   select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
   ```
3. 정책 수: `select tablename, count(*) from pg_policies where schemaname='public' group by 1 order by 1;`
4. RPC 함수 존재: `get_app_state, save_stay, save_room, delete_stay, delete_room, set_favorite, set_rating, set_compare, set_compare_options, set_trip, import_backup ...`
   그리고 anon 실행 권한이 없는지:
   ```sql
   select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec
   from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
   ```
5. 멤버: `select count(*) from public.members;` → 2 여야 함 (이메일은 출력하지 마)
6. Storage: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'stay-photos';`
   정책: `select policyname from pg_policies where schemaname='storage' and tablename='objects';`
7. 데이터 개요(숫자만): 숙소 수, 객실 수, 날짜 구간 수
8. 최근 오류 로그가 있으면 (MCP debugging 도구) 요약

## 보고
| 항목 | 기대값 | 실제 | 결과 |
형식의 표로. 불일치가 있으면 원인 추정과 고치는 SQL(사용자가 실행할 것)을 함께 줘.
