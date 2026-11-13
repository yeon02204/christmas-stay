-- ⚠️ 로컬 테스트 전용 (20261114010000_booking_link_update.sql 적용 후 실행)
-- set_stay_booking_link 가 예약 링크 외의 데이터를 건드리지 않는지, 권한이 유지되는지 확인한다.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false)
$$;

-- 준비: 객실 2개(링크 1개는 있음, 1개는 비어 있음) + 사진·추가금·날짜별 가격·찜·평가·비교
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare s jsonb; r1 jsonb; r2 jsonb;
begin
  s := public.save_stay('{"name":"링크 테스트","homepageUrl":"https://home.example.com"}');
  r1 := public.save_room(jsonb_build_object('stayId', s->'stay'->>'id', 'name', '돔1', 'bookingUrl', 'https://old.example.com/1',
    'images', '[{"type":"url","url":"https://example.com/1.jpg"}]'::jsonb,
    'extras', '[{"id":"bbq","kind":"bbq","name":"바비큐","defaultPrice":30000}]'::jsonb,
    'facilities', '{"toilet":"yes"}'::jsonb,
    'rates', '{"2026-12-24_2026-12-25":{"roomPrice":200000,"availability":"available","extraPrices":{"bbq":35000}}}'::jsonb));
  r2 := public.save_room(jsonb_build_object('stayId', s->'stay'->>'id', 'name', '돔2'));
  perform public.set_favorite((r1->'room'->>'id')::uuid, true);
  perform public.set_rating((r1->'room'->>'id')::uuid, 'mood', 5);
  perform public.set_compare(array[(r1->'room'->>'id')::uuid]);
end $$;
reset role;

-- 바뀌면 안 되는 모든 것의 스냅샷
create temp table snap_other as
  select 'stays' t, to_jsonb(x) - 'updated_at' - 'updated_by' - 'version' v from public.stays x
  union all select 'rooms', to_jsonb(x) - 'booking_url' - 'version' - 'updated_at' - 'updated_by' from public.rooms x
  union all select 'room_images', to_jsonb(x) from public.room_images x
  union all select 'room_extras', to_jsonb(x) from public.room_extras x
  union all select 'room_rates', to_jsonb(x) from public.room_rates x
  union all select 'rate_extra_prices', to_jsonb(x) from public.rate_extra_prices x
  union all select 'favorites', to_jsonb(x) from public.favorites x
  union all select 'ratings', to_jsonb(x) from public.ratings x
  union all select 'compare_items', to_jsonb(x) from public.compare_items x;
create temp table snap_stay_version as select id, version, updated_at from public.stays;
grant select on snap_other, snap_stay_version to authenticated;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare sid uuid := (select id from public.stays where name = '링크 테스트'); res jsonb;
begin
  -- 빈 객실만: 돔2 만 바뀜
  res := public.set_stay_booking_link(sid, 'https://new.example.com/a', true);
  assert res = '{"rooms": 2, "updated": 1}'::jsonb, res::text;
  assert (select booking_url from public.rooms where name = '돔1') = 'https://old.example.com/1', '기존 링크 유지';
  assert (select booking_url from public.rooms where name = '돔2') = 'https://new.example.com/a', '빈 객실 채움';
  -- 모든 객실: 돔1 도 바뀜 (돔2 는 이미 같아서 0)
  res := public.set_stay_booking_link(sid, ' https://new.example.com/a ', false);
  assert res = '{"rooms": 2, "updated": 1}'::jsonb, res::text;
  assert (select count(*) from public.rooms where stay_id = sid and booking_url = 'https://new.example.com/a') = 2, '모든 객실 같은 링크';
  -- 버전이 올라가서 열린 수정 화면은 충돌 확인창이 뜬다
  assert (select version from public.rooms where name = '돔1') = 2, 'version 증가';
  -- 잘못된 주소 / 없는 숙소
  begin perform public.set_stay_booking_link(sid, 'javascript:alert(1)'); raise exception 'FAIL url';
  exception when invalid_parameter_value then null; end;
  begin perform public.set_stay_booking_link(gen_random_uuid(), 'https://x.example.com'); raise exception 'FAIL notfound';
  exception when sqlstate 'P0404' then null; end;
  raise notice 'OK  예약 링크: 빈 객실만 / 모든 객실 / 버전 증가 / 잘못된 주소·없는 숙소 거부';
end $$;
reset role;

-- 링크 외 데이터가 하나도 안 바뀌었는지
do $$
declare diff int;
begin
  select count(*) into diff from (
    (select * from snap_other except
      (select 'stays', to_jsonb(x) - 'updated_at' - 'updated_by' - 'version' from public.stays x
       union all select 'rooms', to_jsonb(x) - 'booking_url' - 'version' - 'updated_at' - 'updated_by' from public.rooms x
       union all select 'room_images', to_jsonb(x) from public.room_images x
       union all select 'room_extras', to_jsonb(x) from public.room_extras x
       union all select 'room_rates', to_jsonb(x) from public.room_rates x
       union all select 'rate_extra_prices', to_jsonb(x) from public.rate_extra_prices x
       union all select 'favorites', to_jsonb(x) from public.favorites x
       union all select 'ratings', to_jsonb(x) from public.ratings x
       union all select 'compare_items', to_jsonb(x) from public.compare_items x))
  ) d;
  assert diff = 0, '링크 외 데이터 변경 ' || diff || '건';
  assert (select count(*) from snap_other where t in ('room_images','room_extras','room_rates','rate_extra_prices','favorites','ratings','compare_items')) = 7, '스냅샷 대상 존재';
  assert not exists (select 1 from public.stays s join snap_stay_version v using (id) where s.version <> v.version or s.updated_at <> v.updated_at), '숙소 행 자체는 그대로';
  raise notice 'OK  링크 외 데이터(숙소·객실 다른 칸·사진·추가금·가격·날짜별 추가금·찜·평가·비교) 변경 0건';
end $$;

-- 권한: 비멤버 / anon
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  begin perform public.set_stay_booking_link((select gen_random_uuid()), 'https://x.example.com'); raise exception 'FAIL 비멤버';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'public.set_stay_booking_link(uuid, text, boolean)', 'execute'), 'anon 실행 불가';
  assert has_function_privilege('authenticated', 'public.set_stay_booking_link(uuid, text, boolean)', 'execute'), 'authenticated 실행 가능';
  assert not (select prosecdef from pg_proc where proname = 'set_stay_booking_link'), 'security invoker';
  raise notice 'OK  권한: 비멤버 차단 · anon 실행 불가 · invoker(RLS 적용)';
end $$;
