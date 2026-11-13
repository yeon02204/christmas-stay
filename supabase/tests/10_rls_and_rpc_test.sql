-- ⚠️ 로컬 테스트 전용 (00_local_supabase_stub.sql + 마이그레이션 적용 후 실행)
-- 두 멤버 A/B 와 비멤버 X 로 RLS·RPC 동작을 검증한다. 실패 시 예외로 중단된다.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
delete from public.members;
delete from auth.users;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'x@test.local');
insert into public.members (user_id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'B');

-- 3번째 멤버는 거부
do $$ begin
  insert into public.members values ('cccccccc-0000-0000-0000-000000000003', 'X');
  raise exception 'FAIL: 3번째 멤버가 등록됨';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  멤버 최대 2명 제한';
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false)
$$;

-- ── A: 숙소/객실 생성 ──
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;

do $$
declare s jsonb; r jsonb; st jsonb; rid uuid; key text := '2026-12-24_2026-12-25';
begin
  s := public.save_stay('{"name":"테스트 숙소","region":"가평","homepageUrl":"https://example.com","coverImage":{"type":"url","url":"https://example.com/a.jpg"}}');
  assert (s->'stay'->>'version')::int = 1, 'stay version 1';

  r := public.save_room(jsonb_build_object(
    'stayId', s->'stay'->>'id', 'name', '객실1', 'baseGuests', 2, 'maxGuests', 4,
    'facilities', '{"toilet":"yes","spa":"no"}'::jsonb,
    'mood', '{"interior":"우드톤"}'::jsonb,
    'images', '[{"type":"url","url":"https://example.com/1.jpg"},{"type":"storage","path":"rooms/x/1.jpg"}]'::jsonb,
    'extras', '[{"id":"bbq","kind":"bbq","name":"바비큐","defaultPrice":30000,"required":false},
                {"id":"fire","kind":"fire","name":"불멍","defaultPrice":null,"required":false},
                {"id":"tmp1","kind":"custom","name":"인원추가","defaultPrice":20000,"required":true}]'::jsonb,
    'rates', jsonb_build_object(key, '{"roomPrice":250000,"availability":"available","checkedAt":"2026-11-13","extraPrices":{"bbq":35000}}'::jsonb)));
  rid := (r->'room'->>'id')::uuid;
  assert jsonb_array_length(r->'room'->'extras') = 3, 'extras 3';
  assert jsonb_array_length(r->'room'->'images') = 2, 'images 2';
  assert (r->'room'->'rates'->key->>'roomPrice')::int = 250000, 'rate saved';
  assert (r->'room'->'rates'->key->'extraPrices'->>(r->'extraIdMap'->>'bbq'))::int = 35000, 'date extra override';
  assert r->'room'->'extras'->1->'defaultPrice' = 'null'::jsonb, '미입력 추가금은 null 유지';
  raise notice 'OK  A 숙소·객실·날짜별 가격 저장';

  -- 이미지 하나 제거 → removedPaths 반환
  r := public.save_room((r->'room') || '{"images":[{"type":"url","url":"https://example.com/1.jpg"}]}');
  assert r->'removedPaths' = '["rooms/x/1.jpg"]'::jsonb, 'removed storage path returned';
  assert (r->'room'->>'version')::int = 2, 'version 2';
  raise notice 'OK  사진 교체 시 삭제할 Storage 경로 반환';

  -- 오래된 version 으로 저장 → 409
  begin
    perform public.save_room((r->'room') || '{"version":1}');
    raise exception 'FAIL: stale version accepted';
  exception when sqlstate 'P0409' then raise notice 'OK  동시 수정 충돌 감지 (P0409)';
  end;

  -- 잘못된 값 거부
  begin
    perform public.save_room((r->'room') || '{"rates":{"2026-12-24_2026-12-25":{"roomPrice":-1}}}');
    raise exception 'FAIL: negative price accepted';
  exception when check_violation then raise notice 'OK  음수 숙박비 거부';
  end;
  begin
    perform public.save_stay('{"name":"x","homepageUrl":"javascript:alert(1)"}');
    raise exception 'FAIL: bad url accepted';
  exception when check_violation then raise notice 'OK  잘못된 URL 거부';
  end;
  begin
    perform public.save_room((r->'room') || '{"facilities":{"toilet":"maybe"}}');
    raise exception 'FAIL: bad facility accepted';
  exception when check_violation then raise notice 'OK  시설 상태값 검증';
  end;
  begin
    perform public.save_room((r->'room') || '{"rates":{"2026-12-25_2026-12-24":{"roomPrice":1}}}');
    raise exception 'FAIL: bad range accepted';
  exception when check_violation then raise notice 'OK  체크아웃<체크인 구간 거부';
  end;

  perform public.set_favorite(rid, true);
  perform public.update_favorite_memo(rid, 'A 메모');
  perform public.set_rating(rid, 'price', 4);
  perform public.set_compare(array[rid]);
  perform public.set_compare_options(true, false, array[(r->'room'->'extras'->2->>'id')::uuid]);
  st := public.get_app_state();
  assert jsonb_array_length(st->'favorites') = 1 and st->'favorites'->0->>'memo' = 'A 메모', 'A favorite';
  assert st->'compareOptions'->>'bbq' = 'true', 'compare options';
  raise notice 'OK  A 찜·평가·비교 저장';
end $$;

-- ── B: 공동 데이터는 보이고, A 의 찜/비교는 안 보임 ──
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;

do $$
declare st jsonb; rid uuid; n int;
begin
  st := public.get_app_state();
  assert jsonb_array_length(st->'stays') = 1, 'B sees shared stay';
  assert jsonb_array_length(st->'rooms') = 1, 'B sees shared room';
  assert jsonb_array_length(st->'favorites') = 0, 'B does not see A favorites';
  assert jsonb_array_length(st->'compare') = 0, 'B does not see A compare';
  assert jsonb_array_length(st->'ratings') = 1, 'B can see A rating';
  rid := (st->'rooms'->0->>'id')::uuid;
  raise notice 'OK  B: 공동 숙소 조회 / A 찜·비교 비공개 / A 평가 조회 가능';

  -- B 가 A 의 찜/평가를 직접 수정/삭제 시도 → 0행
  update public.favorites set memo = 'hacked' where room_id = rid;
  get diagnostics n = row_count; assert n = 0, 'B cannot update A favorite';
  delete from public.ratings where room_id = rid;
  get diagnostics n = row_count; assert n = 0, 'B cannot delete A rating';
  begin
    insert into public.favorites (user_id, room_id) values ('aaaaaaaa-0000-0000-0000-000000000001', rid);
    raise exception 'FAIL: B inserted favorite as A';
  exception when insufficient_privilege then raise notice 'OK  B 는 A 명의로 찜 생성 불가';
  end;

  perform public.set_rating(rid, 'price', 2);
  perform public.set_favorite(rid, true);
  st := public.get_app_state();
  assert jsonb_array_length(st->'ratings') = 2, 'two ratings';
  -- B 가 공동 데이터 수정 가능
  perform public.update_room_notes(rid, '장점B', '단점B');
  perform public.set_trip('2026-12-25', '2026-12-27');
  raise notice 'OK  B 평가·찜은 B 것으로 분리 저장, 공동 메모·일정 수정 가능';

  begin
    perform public.set_trip('2026-12-25', '2026-12-25');
    raise exception 'FAIL: zero-night trip';
  exception when check_violation then raise notice 'OK  0박 일정 거부';
  end;
  begin
    perform public.set_rating(rid, 'price', 6);
    raise exception 'FAIL: rating 6';
  exception when invalid_parameter_value then raise notice 'OK  평가 1~5 범위 검증';
  end;
end $$;

-- ── X(비멤버): 아무것도 보이지 않음 ──
reset role;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
set role authenticated;
do $$
declare n int;
begin
  begin
    perform public.get_app_state();
    raise exception 'FAIL: non-member got state';
  exception when insufficient_privilege then raise notice 'OK  비멤버 RPC 차단';
  end;
  select count(*) into n from public.stays; assert n = 0, 'X sees no stays';
  select count(*) into n from public.ratings; assert n = 0, 'X sees no ratings';
  update public.trip_settings set check_in = '2027-01-01';
  get diagnostics n = row_count; assert n = 0, 'X cannot update trip';
  begin
    insert into public.stays (name) values ('침입');
    raise exception 'FAIL: X inserted stay';
  exception when insufficient_privilege then raise notice 'OK  비멤버 테이블 직접 접근 차단';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('stay-photos', 'x.jpg');
    raise exception 'FAIL: X uploaded';
  exception when insufficient_privilege then raise notice 'OK  비멤버 Storage 업로드 차단';
  end;
end $$;

-- ── anon: 차단 ──
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
do $$ begin
  perform count(*) from public.stays;
  raise exception 'FAIL: anon read stays';
exception when insufficient_privilege then raise notice 'OK  anon 접근 차단';
end $$;

-- ── A: 숙소 삭제 → 객실·두 사람의 찜/평가/비교 cascade ──
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare st jsonb; imp jsonb; res jsonb;
begin
  st := public.get_app_state();
  imp := public.stay_delete_impact((st->'stays'->0->>'id')::uuid);
  assert (imp->>'rooms')::int = 1 and (imp->>'favorites')::int = 2 and (imp->>'compares')::int = 1, 'impact ' || imp::text;
  res := public.delete_stay((st->'stays'->0->>'id')::uuid);
  st := public.get_app_state();
  assert jsonb_array_length(st->'rooms') = 0 and jsonb_array_length(st->'favorites') = 0
     and jsonb_array_length(st->'compare') = 0 and jsonb_array_length(st->'ratings') = 0, 'cascade';
  assert st->'trip'->>'checkIn' = '2026-12-25', 'trip shared';
  raise notice 'OK  숙소 삭제 영향 계산 및 cascade 정리';
end $$;

-- ── 백업 복원 (localStorage v1 형식) ──
do $$
declare st jsonb; res jsonb; rk text;
begin
  res := public.import_backup('{
    "stays":[{"id":"stay_1","name":"복원 숙소","region":"홍천","coverImage":{"type":"storage","path":"stays/c.jpg"}}],
    "rooms":[{"id":"room_1","stayId":"stay_1","name":"복원 객실","pros":"좋음",
              "extras":[{"id":"bbq","kind":"bbq","name":"바비큐","defaultPrice":null,"required":false},
                        {"id":"ext_9","kind":"custom","name":"조식","defaultPrice":15000,"required":false}],
              "rates":{"2026-12-24_2026-12-25":{"roomPrice":199000,"extraPrices":{"ext_9":18000},"availability":"unchecked","checkedAt":""}},
              "ratings":{"price":5,"location":null}},
             {"id":"room_orphan","stayId":"nope","name":"고아"}],
    "favorites":[{"roomId":"room_1","memo":"1순위"}],
    "compare":["room_1","missing"],
    "compareOptions":{"bbq":true,"fire":false,"custom":{"room_1":{"ext_9":true}}},
    "trip":{"checkIn":"2026-12-24","checkOut":"2026-12-25"}}');
  st := public.get_app_state();
  assert jsonb_array_length(st->'stays') = 1 and jsonb_array_length(st->'rooms') = 1, 'restored counts';
  assert st->'rooms'->0->>'pros' = '좋음', 'pros restored';
  rk := st->'rooms'->0->'extras'->1->>'id';
  assert (st->'rooms'->0->'rates'->'2026-12-24_2026-12-25'->'extraPrices'->>rk)::int = 18000, 'extra map restored';
  assert st->'favorites'->0->>'memo' = '1순위', 'favorite restored';
  assert jsonb_array_length(st->'compare') = 1, 'compare restored';
  assert st->'compareOptions'->'extraIds'->>0 = rk, 'custom selection restored';
  assert (st->'ratings'->0->>'price')::int = 5 and st->'ratings'->0->'location' = 'null'::jsonb, 'ratings restored';
  raise notice 'OK  JSON 백업(localStorage 형식) 복원 및 id 재매핑';
end $$;

reset role;
\echo '── 모든 RLS / RPC 테스트 통과 ──'
