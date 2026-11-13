-- ⚠️ 로컬 테스트 전용 (20261114000000_stay_type.sql 적용 후 실행)
-- 숙소 유형 저장·수정·검증, 백업 복원, 권한 유지를 확인한다.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false)
$$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare s jsonb; st jsonb;
begin
  -- 생성: 유형 저장 / 없으면 '' (미분류)
  s := public.save_stay('{"name":"유형 테스트","stayType":"glamping"}');
  assert s->'stay'->>'stayType' = 'glamping', '유형 저장';
  assert (public.save_stay('{"name":"유형 없음"}'))->'stay'->>'stayType' = '', '미입력은 미분류';
  -- 수정: 유형 변경, version 증가
  s := public.save_stay((s->'stay') || '{"stayType":"poolvilla"}');
  assert s->'stay'->>'stayType' = 'poolvilla' and (s->'stay'->>'version')::int = 2, '유형 수정';
  -- 잘못된 값 거부 (23514)
  begin
    perform public.save_stay((s->'stay') || '{"stayType":"motel"}');
    raise exception 'FAIL: 잘못된 유형 저장됨';
  exception when check_violation then null; end;
  -- 앱 초기 로딩에 포함
  st := public.get_app_state();
  assert exists (select 1 from jsonb_array_elements(st->'stays') x where x->>'name' = '유형 테스트' and x->>'stayType' = 'poolvilla'), 'get_app_state 에 stayType';
  raise notice 'OK  숙소 유형 저장·수정·미분류·잘못된 값 거부·앱 로딩 포함';

  -- 백업 복원 시 유형 유지
  perform public.import_backup('{"stays":[{"id":"x1","name":"복원 숙소","stayType":"caravan"}],"rooms":[]}');
  assert (select stay_type from public.stays where name = '복원 숙소') = 'caravan', '백업 복원 유형 유지';
  raise notice 'OK  백업 복원 시 유형 유지';
end $$;

-- 비멤버는 여전히 접근 불가
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.save_stay('{"name":"침입","stayType":"glamping"}');
    raise exception 'FAIL: 비멤버 저장';
  exception when insufficient_privilege then null; end;
  assert not exists (select 1 from public.stays), '비멤버 조회 0행';
  raise notice 'OK  비멤버 차단 유지';
end $$;
reset role;
