-- ⚠️ 로컬 테스트 전용 (00_local_supabase_stub.sql + 마이그레이션 + 10_rls_and_rpc_test.sql 다음에 실행)
-- members 컬럼 권한, save_room 추가금 id/날짜별 금액 보존, 권한 매트릭스, 기본 일정을 검증한다.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false)
$$;

-- ── 1. members: display_name 만 수정 가능 ──
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
begin
  update public.members set display_name = 'A2' where user_id = auth.uid();
  assert (select display_name from public.members where user_id = auth.uid()) = 'A2', 'display_name 수정';
  begin
    update public.members set user_id = 'cccccccc-0000-0000-0000-000000000003' where user_id = auth.uid();
    raise exception 'FAIL: user_id 변경됨';
  exception when insufficient_privilege then null; end;
  begin
    update public.members set created_at = now() where user_id = auth.uid();
    raise exception 'FAIL: created_at 변경됨';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.members where user_id = auth.uid();
    raise exception 'FAIL: 멤버가 스스로 삭제됨';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.members values ('cccccccc-0000-0000-0000-000000000003', 'X');
    raise exception 'FAIL: 멤버가 다른 멤버를 추가함';
  exception when insufficient_privilege then null; end;
  -- 상대 멤버 이름은 못 바꿈 (RLS: 0행)
  update public.members set display_name = 'hack' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert (select display_name from public.members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') <> 'hack', '상대 이름 보호';
  update public.members set display_name = 'A' where user_id = auth.uid();
  raise notice 'OK  members: display_name 만 수정, user_id·created_at·추가·삭제 불가';
end $$;

-- ── 2. save_room: 기존 추가금 id 유지 / 날짜별 추가금 보존 ──
do $$
declare s jsonb; r jsonb; r2 jsonb; k1 text := '2026-12-25_2026-12-26'; k2 text := '2026-12-26_2026-12-27';
        bbq uuid; fire uuid; cus uuid; sel_cnt int;
begin
  s := public.save_stay('{"name":"하드닝 테스트"}');
  r := public.save_room(jsonb_build_object('stayId', s->'stay'->>'id', 'name', '객실H',
    'extras', '[{"id":"bbq","kind":"bbq","name":"바비큐","defaultPrice":30000},
                {"id":"fire","kind":"fire","name":"불멍","defaultPrice":20000},
                {"id":"tmpA","kind":"custom","name":"조식","defaultPrice":10000}]'::jsonb,
    'rates', jsonb_build_object(
      k1, '{"roomPrice":100000,"extraPrices":{"bbq":35000,"tmpA":12000}}'::jsonb,
      k2, '{"roomPrice":110000,"extraPrices":{"fire":25000}}'::jsonb)));
  bbq := (r->'extraIdMap'->>'bbq')::uuid; fire := (r->'extraIdMap'->>'fire')::uuid; cus := (r->'extraIdMap'->>'tmpA')::uuid;
  perform public.set_compare_options(false, false, array[cus]);

  -- (a) 그대로 다시 저장 → id·날짜별 금액 유지
  r2 := public.save_room(r->'room');
  assert r2->'room'->'extras' = r->'room'->'extras', '재저장 시 추가금 id/내용 동일';
  assert r2->'room'->'rates' = r->'room'->'rates', '재저장 시 날짜별 금액 동일';

  -- (b) 기본값만 수정 → id 유지, 날짜별 금액 유지
  r2 := public.save_room(jsonb_set(r2->'room', '{extras,0,defaultPrice}', '31000'));
  assert (r2->'room'->'extras'->0->>'id')::uuid = bbq, 'bbq id 유지';
  assert (r2->'room'->'extras'->0->>'defaultPrice')::int = 31000, 'bbq 기본값 수정';
  assert (r2->'room'->'rates'->k1->'extraPrices'->>bbq::text)::int = 35000, 'bbq 날짜별 금액 유지';
  assert (r2->'room'->'rates'->k1->'extraPrices'->>cus::text)::int = 12000, 'custom 날짜별 금액 유지';

  -- (c) extraPrices 키가 없는 요청 → 기존 날짜별 금액 보존
  r2 := public.save_room(r2->'room' #- array['rates', k1, 'extraPrices']);
  assert (r2->'room'->'rates'->k1->'extraPrices'->>bbq::text)::int = 35000, 'extraPrices 생략 시 보존';
  -- 빈 객체를 보내면 의도적으로 비움
  r2 := public.save_room(jsonb_set(r2->'room', array['rates', k2, 'extraPrices'], '{}'));
  assert r2->'room'->'rates'->k2->'extraPrices' = '{}'::jsonb, 'extraPrices {} 는 비움';

  -- (d) 불멍 항목 삭제 → 그 추가금만 정리, 다른 추가금 날짜별 금액·비교 선택 유지
  r2 := public.save_room(jsonb_set(r2->'room', '{extras}', (r2->'room'->'extras') - 1));
  assert not exists (select 1 from public.room_extras where id = fire), '불멍 삭제';
  assert (r2->'room'->'rates'->k1->'extraPrices'->>bbq::text)::int = 35000, '남은 bbq 날짜별 금액 유지';
  select count(*) into sel_cnt from public.compare_extra_selections where extra_id = cus;
  assert sel_cnt = 1, 'custom 비교 선택 유지';

  -- (e) 종류 맞바꾸기 (bbq ↔ custom) 도 unique 인덱스 오류 없이 저장
  r2 := public.save_room(jsonb_set(jsonb_set(r2->'room', '{extras,0,kind}', '"custom"'), '{extras,1,kind}', '"bbq"'));
  assert (r2->'room'->'extras'->0->>'kind') = 'custom' and (r2->'room'->'extras'->1->>'kind') = 'bbq', '종류 교환';
  assert (r2->'room'->'extras'->0->>'id')::uuid = bbq and (r2->'room'->'extras'->1->>'id')::uuid = cus, '교환 후 id 유지';

  -- (f) 같은 요청 안에 중복 id → 두 번째는 새 id (한 행으로 합쳐지지 않음)
  r2 := public.save_room(jsonb_set(r2->'room', '{extras}', (r2->'room'->'extras') || jsonb_build_array(
          jsonb_build_object('id', cus, 'kind', 'custom', 'name', '중복', 'defaultPrice', 1))));
  assert jsonb_array_length(r2->'room'->'extras') = 3, '중복 id 는 별도 항목';
  assert (select count(*) from public.room_extras where room_id = (r->'room'->>'id')::uuid) = 3, 'DB 3행';

  -- (g) 다른 객실의 추가금 id 를 보내도 그 객실 데이터는 건드리지 않음
  r := public.save_room(jsonb_build_object('stayId', s->'stay'->>'id', 'name', '객실H2',
    'extras', jsonb_build_array(jsonb_build_object('id', bbq, 'kind', 'bbq', 'name', '남의 id', 'defaultPrice', 1))));
  assert (r->'room'->'extras'->0->>'id')::uuid <> bbq, '다른 객실 id 는 새로 발급';
  assert (select name from public.room_extras where id = bbq) = '바비큐', '원래 객실 추가금 그대로';
  raise notice 'OK  save_room: 추가금 id 유지 · 날짜별 금액 보존 · 종류 교환 · 중복/타 객실 id 처리';
end $$;

-- ── 3. 권한 매트릭스 ──
reset role;
do $$
declare bad text;
begin
  -- anon: public 스키마 테이블·함수 권한 0
  select string_agg(table_name || ':' || privilege_type, ', ') into bad
    from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  assert bad is null, 'anon 테이블 권한 있음: ' || coalesce(bad, '');
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'execute'))
      and p.proname not in ('guest_login', 'guest_get_app_state');  -- 게스트 모드용 2개만 허용 (20261114020000_guest_view.sql)
  assert bad is null, 'anon 실행 가능 함수: ' || coalesce(bad, '');
  -- authenticated: TRUNCATE/REFERENCES/TRIGGER 없음, 모든 테이블 SELECT 있음
  select string_agg(table_name || ':' || privilege_type, ', ') into bad
    from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');
  assert bad is null, 'authenticated 불필요 권한: ' || coalesce(bad, '');
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('authenticated', c.oid, 'select');
  assert bad is null, 'authenticated SELECT 없음: ' || coalesce(bad, '');
  -- authenticated: 모든 public 함수 실행 가능 (RPC + 헬퍼)
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname not in ('guest_login', 'guest_get_app_state');  -- 게스트 전용 (회원은 필요 없음)
  assert bad is null, 'authenticated 실행 불가 함수: ' || coalesce(bad, '');
  -- 모든 public 테이블 RLS 켜짐
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert bad is null, 'RLS 꺼진 테이블: ' || coalesce(bad, '');
  -- 모든 public 함수 search_path 고정
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  assert bad is null, 'search_path 미고정 함수: ' || coalesce(bad, '');
  -- security definer 함수: 멤버 확인 3개 + (게스트 마이그레이션 적용 시) 게스트·비밀번호 관리 함수
  select string_agg(p.proname, ', ' order by p.proname) into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef;
  assert bad in ('_require_member, is_member, stay_delete_impact',
                 '_require_member, guest_get_app_state, guest_login, is_member, member_guest_pin_status, member_set_guest_pin, stay_delete_impact'),
         'security definer 함수: ' || bad;
  raise notice 'OK  권한: anon 0 · authenticated 최소 권한 · RLS 전 테이블 · search_path 고정 · definer 3개';
end $$;

-- ── 4. 비멤버: trip_settings 추가/삭제, 멤버 자가 등록 불가 ──
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
set role authenticated;
do $$
begin
  begin
    insert into public.members values ('cccccccc-0000-0000-0000-000000000003', 'X');
    raise exception 'FAIL: 비멤버 자가 등록';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.trip_settings;
    raise exception 'FAIL: trip 삭제';
  exception when insufficient_privilege then null; end;
  assert not exists (select 1 from public.members), '비멤버는 멤버 목록 조회 불가';
  begin
    perform public.stay_delete_impact(gen_random_uuid());
    raise exception 'FAIL: 비멤버 definer 함수 실행';
  exception when insufficient_privilege then null; end;
  raise notice 'OK  비멤버: 자가 등록·일정 삭제·definer 함수 차단';
end $$;
reset role;
