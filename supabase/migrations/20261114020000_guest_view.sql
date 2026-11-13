-- ════════════════════════════════════════════════════════════════════
-- 비회원 구경(게스트) 모드
--
-- 적용 방법: 앞의 마이그레이션을 모두 실행한 프로젝트에서 SQL Editor 에 전체 붙여넣고 Run.
-- 여러 번 실행해도 안전하다. 기존 테이블·RLS 정책·회원 권한은 바꾸지 않는다.
--
-- 구조
--  · 구경 비밀번호(4자리)는 API 로 접근할 수 없는 private 스키마에 bcrypt 해시로만 저장한다.
--  · guest_login(pin)            : 서버에서 비밀번호 확인 → 6시간짜리 서명 토큰 발급 (실패 5번이면 15분 잠금)
--  · guest_get_app_state(token)  : 토큰 확인 → 숙소·객실·가격·사진 등 읽기 전용 데이터 반환
--  · anon(비로그인) 역할에는 위 두 함수 실행 권한만 준다. 테이블 권한은 여전히 0 → 게스트의 DB 쓰기는 불가능.
--  · 게스트에게는 찜·평가·비교 목록·멤버 정보를 보내지 않는다.
--
-- 비밀번호 설정/변경
--  · 앱: 로그인한 멤버가 [데이터] 화면 맨 아래 '구경 비밀번호' 에서 바꾼다 (member_set_guest_pin)
--  · SQL Editor: select private.set_guest_pin('1234');  /  select private.set_guest_pin(null);  -- 끄기
--  바꾸면 이미 들어와 있던 게스트는 모두 다시 입력해야 한다. 비밀번호 자체는 어디에서도 다시 볼 수 없다.
-- ════════════════════════════════════════════════════════════════════

-- pgcrypto: Supabase 에는 extensions 스키마에 이미 설치돼 있다 (없으면 설치)
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.guest_access (
  id                smallint primary key default 1 check (id = 1),
  pin_hash          text,                                   -- bcrypt. null = 구경 기능 꺼짐
  token_secret      bytea not null default extensions.gen_random_bytes(32),
  fail_count        integer not null default 0,
  fail_window_start timestamptz,
  locked_until      timestamptz,
  updated_at        timestamptz not null default now()
);
insert into private.guest_access (id) values (1) on conflict (id) do nothing;
alter table private.guest_access enable row level security;  -- 정책 없음 = API 역할은 접근 불가 (이중 잠금)
revoke all on private.guest_access from public, anon, authenticated;

-- ───── 관리자 전용: 구경 비밀번호 설정 ─────
create or replace function private.set_guest_pin(p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin is null then
    update private.guest_access set pin_hash = null, token_secret = extensions.gen_random_bytes(32),
      fail_count = 0, fail_window_start = null, locked_until = null, updated_at = now() where id = 1;
    return '구경 기능을 껐어 (들어와 있던 게스트도 모두 나가게 돼)';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception '구경 비밀번호는 4자리 숫자여야 해' using errcode = '22023';
  end if;
  update private.guest_access set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
    token_secret = extensions.gen_random_bytes(32), fail_count = 0, fail_window_start = null,
    locked_until = null, updated_at = now() where id = 1;
  return '구경 비밀번호를 설정했어 (이전 구경 세션은 모두 끝났어)';
end $$;
revoke all on function private.set_guest_pin(text) from public, anon, authenticated;

-- 토큰: "<만료 시각(epoch 초)>.<HMAC-SHA256(만료 시각, 비밀키) hex>"
create or replace function private.guest_token_valid(p_token text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  m text[];
  v_exp bigint;
  v_now bigint := floor(extract(epoch from now()));
  v_secret bytea;
begin
  m := regexp_match(coalesce(p_token, ''), '^([0-9]{1,12})\.([0-9a-f]{64})$');
  if m is null then return false; end if;
  v_exp := m[1]::bigint;
  if v_exp <= v_now or v_exp > v_now + 6 * 3600 + 60 then return false; end if;
  select token_secret into v_secret from private.guest_access where id = 1 and pin_hash is not null;
  if v_secret is null then return false; end if;
  return encode(extensions.hmac(convert_to(m[1], 'UTF8'), v_secret, 'sha256'), 'hex') = m[2];
end $$;
revoke all on function private.guest_token_valid(text) from public, anon, authenticated;

-- ───── 게스트 입장: 비밀번호 확인 → 토큰 ─────
-- 실패해도 예외를 던지지 않고 결과로 돌려준다 (예외면 실패 횟수 기록까지 되돌려지기 때문)
create or replace function public.guest_login(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g private.guest_access;
  v_exp bigint;
begin
  select * into g from private.guest_access where id = 1 for update;
  if g.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'disabled');
  end if;
  if g.locked_until is not null and g.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'retryAfter', ceil(extract(epoch from g.locked_until - now()))::int);
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or extensions.crypt(p_pin, g.pin_hash) <> g.pin_hash then
    -- 10분 안에 5번 틀리면 15분 잠금
    if g.fail_window_start is null or g.fail_window_start < now() - interval '10 minutes' then
      update private.guest_access set fail_count = 1, fail_window_start = now(), locked_until = null where id = 1;
    else
      update private.guest_access set fail_count = fail_count + 1,
        locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' end
      where id = 1;
    end if;
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;
  update private.guest_access set fail_count = 0, fail_window_start = null, locked_until = null where id = 1;
  v_exp := floor(extract(epoch from now() + interval '6 hours'));
  return jsonb_build_object('ok', true, 'expiresAt', v_exp,
    'token', v_exp::text || '.' || encode(extensions.hmac(convert_to(v_exp::text, 'UTF8'), g.token_secret, 'sha256'), 'hex'));
end $$;

-- ───── 게스트용 읽기 전용 데이터 ─────
-- get_app_state 와 같은 모양. 숙소·객실(사진·가격·추가금·시설·분위기)·여행 일정만 담고,
-- 개인 데이터(찜·평가·비교·멤버)는 비워서 보낸다.
create or replace function public.guest_get_app_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.guest_token_valid(p_token) then
    raise exception 'GUEST_EXPIRED: 구경 시간이 끝났어. 비밀번호를 다시 입력해 줘' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'me', jsonb_build_object('id', null, 'displayName', '게스트', 'guest', true),
    'members', '[]'::jsonb,
    'trip', (select jsonb_build_object('checkIn', to_char(check_in, 'YYYY-MM-DD'), 'checkOut', to_char(check_out, 'YYYY-MM-DD'),
                                       'updatedAt', null, 'updatedBy', null)
             from public.trip_settings where id = 1),
    'stays', (select coalesce(jsonb_agg(public._stay_json(s) - 'updatedBy' order by s.created_at desc), '[]'::jsonb) from public.stays s),
    'rooms', (select coalesce(jsonb_agg(public._room_json(r.id) - 'updatedBy' order by r.created_at), '[]'::jsonb) from public.rooms r),
    'favorites', '[]'::jsonb,
    'ratings', '[]'::jsonb,
    'compare', '[]'::jsonb,
    'compareOptions', jsonb_build_object('bbq', false, 'fire', false, 'extraIds', '[]'::jsonb));
end $$;

-- ───── 멤버(로그인한 관리자)용: 구경 비밀번호 상태 확인·변경 ─────
-- 비밀번호 값은 돌려주지 않는다 (켜짐 여부와 바꾼 시각만)
create or replace function public.member_guest_pin_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_member();
  return (select jsonb_build_object('enabled', pin_hash is not null, 'updatedAt', updated_at)
          from private.guest_access where id = 1);
end $$;

-- p_pin: 4자리 숫자 = 설정/변경, null = 구경 기능 끄기
create or replace function public.member_set_guest_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_member();
  perform private.set_guest_pin(p_pin);
  return public.member_guest_pin_status();
end $$;

-- 권한: anon 은 게스트 함수 두 개만 실행 가능. 비밀번호 관리 함수는 회원만. 기존 회원 권한은 그대로.
grant usage on schema public to anon;
revoke all on function public.guest_login(text), public.guest_get_app_state(text) from public, authenticated;
grant execute on function public.guest_login(text), public.guest_get_app_state(text) to anon;
revoke all on function public.member_guest_pin_status(), public.member_set_guest_pin(text) from public, anon;
grant execute on function public.member_guest_pin_status(), public.member_set_guest_pin(text) to authenticated;
