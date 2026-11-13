-- ⚠️ 로컬 테스트 전용 (20261114020000_guest_view.sql 적용 후, 10번 테스트 데이터가 있는 상태에서 실행)
-- 게스트 비밀번호 확인·잠금·토큰·읽기 전용, anon 쓰기 차단, 회원 권한 유지를 확인한다.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
select set_config('request.jwt.claims', '', false);
select private.set_guest_pin('4821');

-- ── anon(비회원) 역할 ──
set role anon;
do $$
declare r jsonb; st jsonb; tok text; i int;
begin
  -- 틀린 비밀번호 / 형식 오류
  r := public.guest_login('0000');
  assert r = '{"ok": false, "error": "wrong"}'::jsonb, r::text;
  assert (public.guest_login('48a1'))->>'error' = 'wrong', '숫자 아님';
  -- 맞는 비밀번호 → 토큰
  r := public.guest_login('4821');
  assert (r->>'ok')::boolean, r::text;
  tok := r->>'token';
  assert (r->>'expiresAt')::bigint between floor(extract(epoch from now() + interval '6 hours')) - 5
                                         and floor(extract(epoch from now() + interval '6 hours')) + 5, '6시간 만료';
  -- 읽기 전용 데이터: 숙소·객실은 있고 개인 데이터는 없음
  st := public.guest_get_app_state(tok);
  assert (st->'me'->>'guest')::boolean, 'guest 표시';
  assert jsonb_array_length(st->'stays') > 0 and jsonb_array_length(st->'rooms') > 0, '숙소·객실 조회';
  assert st->'rooms'->0 ? 'rates' and st->'rooms'->0 ? 'extras' and st->'rooms'->0 ? 'images', '가격·추가금·사진 포함';
  assert st->'favorites' = '[]' and st->'ratings' = '[]' and st->'compare' = '[]' and st->'members' = '[]', '개인 데이터 없음';
  assert not (st->'stays'->0 ? 'updatedBy'), '회원 id 숨김';
  raise notice 'OK  게스트: 틀린 비번 거부 · 맞는 비번 토큰(6시간) · 읽기 전용 데이터 · 개인 데이터 제외';

  -- 위조·변조 토큰 거부
  for st in select to_jsonb(x) from unnest(array[
      '', 'abc', split_part(tok, '.', 1) || '.' || repeat('0', 64),
      (split_part(tok, '.', 1)::bigint + 100)::text || '.' || split_part(tok, '.', 2)]) x loop
    begin
      perform public.guest_get_app_state(st #>> '{}');
      raise exception 'FAIL: 잘못된 토큰 통과 %', st;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'OK  위조·변조 토큰 거부';

  -- anon 의 DB 쓰기·회원 RPC·테이블 직접 접근 차단
  begin perform public.save_stay('{"name":"게스트 숙소"}'); raise exception 'FAIL save_stay';
  exception when insufficient_privilege then null; end;
  begin perform public.get_app_state(); raise exception 'FAIL get_app_state';
  exception when insufficient_privilege then null; end;
  begin perform public.set_favorite(gen_random_uuid(), true); raise exception 'FAIL set_favorite';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.stays; raise exception 'FAIL select stays';
  exception when insufficient_privilege then null; end;
  begin insert into public.stays (name) values ('x'); raise exception 'FAIL insert stays';
  exception when insufficient_privilege then null; end;
  begin perform private.set_guest_pin('0000'); raise exception 'FAIL set_guest_pin';
  exception when insufficient_privilege then null; end;
  begin perform 1 from private.guest_access; raise exception 'FAIL private table';
  exception when insufficient_privilege then null; end;
  raise notice 'OK  anon: 쓰기 RPC·회원 RPC·테이블·private 스키마 모두 차단';
end $$;

-- 실패 5번 → 잠금 (예외가 아니라 결과로 돌려줘서 실패 횟수가 실제로 쌓이는지)
do $$
declare r jsonb; i int;
begin
  for i in 1..5 loop r := public.guest_login('1111'); end loop;
  r := public.guest_login('4821');
  assert r->>'error' = 'locked' and (r->>'retryAfter')::int > 800, '5번 실패 후 맞는 비번도 잠금: ' || r::text;
  raise notice 'OK  10분 안에 5번 틀리면 15분 잠금 (맞는 비번도 거부)';
end $$;

-- 만료된 토큰 / 비밀번호 변경 시 기존 토큰 무효
reset role;
update private.guest_access set locked_until = null, fail_count = 0, fail_window_start = null;
do $$
declare v_secret bytea := (select token_secret from private.guest_access); v_exp bigint := floor(extract(epoch from now())) - 1;
        old_tok text; tok text;
begin
  old_tok := v_exp::text || '.' || encode(extensions.hmac(convert_to(v_exp::text, 'UTF8'), v_secret, 'sha256'), 'hex');
  assert not private.guest_token_valid(old_tok), '만료 토큰 거부';
  tok := (public.guest_login('4821'))->>'token';
  assert private.guest_token_valid(tok), '새 토큰 유효';
  perform private.set_guest_pin('7777');
  assert not private.guest_token_valid(tok), '비밀번호 바꾸면 기존 토큰 무효';
  perform private.set_guest_pin(null);
  assert (public.guest_login('7777'))->>'error' = 'disabled', '기능 끄기';
  begin perform private.set_guest_pin('12345'); raise exception 'FAIL 5자리';
  exception when invalid_parameter_value then null; end;
  perform private.set_guest_pin('4821');
  raise notice 'OK  만료 토큰 거부 · 비밀번호 변경 시 기존 세션 종료 · 기능 끄기 · 4자리만 허용';
end $$;

-- 회원 권한은 그대로, 회원 역할로는 게스트 함수 실행 불가(필요 없음)
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, false);
set role authenticated;
do $$ begin
  assert jsonb_array_length(public.get_app_state()->'stays') > 0, '회원 조회 유지';
  perform public.save_stay('{"name":"회원 저장 확인"}');
  begin perform public.guest_login('4821'); raise exception 'FAIL authenticated guest_login';
  exception when insufficient_privilege then null; end;
  raise notice 'OK  회원 권한 유지 (조회·저장), 게스트 함수는 anon 전용';
  -- 멤버가 앱에서 비밀번호 관리
  assert (public.member_guest_pin_status())->>'enabled' = 'true', '상태: 켜짐';
  assert not (public.member_guest_pin_status() ? 'pin') and public.member_guest_pin_status()::text !~ '4821', '비밀번호 값은 안 보임';
  assert (public.member_set_guest_pin('5930'))->>'enabled' = 'true', '멤버가 변경';
  begin perform public.member_set_guest_pin('12a4'); raise exception 'FAIL 형식';
  exception when invalid_parameter_value then null; end;
  assert (public.member_set_guest_pin(null))->>'enabled' = 'false', '멤버가 끄기';
  perform public.member_set_guest_pin('4821');
  raise notice 'OK  멤버: 상태 확인(비밀번호 값 비노출) · 변경 · 형식 검사 · 끄기';
end $$;
-- 비멤버(로그인만 한 계정)와 anon 은 비밀번호 관리 불가
select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text, false);
do $$ begin
  begin perform public.member_set_guest_pin('0000'); raise exception 'FAIL 비멤버 변경';
  exception when insufficient_privilege then null; end;
  begin perform public.member_guest_pin_status(); raise exception 'FAIL 비멤버 상태';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
do $$ begin
  begin perform public.member_set_guest_pin('0000'); raise exception 'FAIL anon 변경';
  exception when insufficient_privilege then null; end;
  assert (public.guest_login('4821'))->>'ok' = 'true', '비밀번호 그대로';
  raise notice 'OK  비멤버·anon 은 비밀번호 관리 불가';
end $$;
reset role;
do $$ begin
  assert (select prosecdef from pg_proc where proname = 'guest_login') and (select prosecdef from pg_proc where proname = 'guest_get_app_state'), 'definer';
  assert not has_table_privilege('anon', 'public.stays', 'select'), 'anon 테이블 0';
  raise notice 'OK  anon 테이블 권한 0 유지';
end $$;
