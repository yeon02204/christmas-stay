-- ════════════════════════════════════════════════════════════════════
-- Christmas Stay — Supabase 스키마 / 제약조건 / RLS / Storage 정책 / RPC
--
-- 적용 방법: Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록(idempotent) 작성했다. 단, 테이블 구조 변경은
-- 이후 별도 마이그레이션 파일로 추가한다.
--
-- 원칙
--  · 숙소/객실/가격/시설 데이터는 두 멤버가 함께 조회·수정한다.
--  · 찜/평가/비교 목록은 사용자별로 분리한다 (평가는 서로 조회만 가능).
--  · members 테이블에 등록된 계정만 데이터에 접근할 수 있다.
--    (회원가입이 실수로 열려 있어도 멤버가 아니면 아무것도 보이지 않는다)
--  · 실제 숙소 데이터는 넣지 않는다. 공동 일정 기본값(12/24~12/25)만 넣는다.
-- ════════════════════════════════════════════════════════════════════

-- ───────────────────────── 멤버 ─────────────────────────

create table if not exists public.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 20),
  created_at   timestamptz not null default now()
);

create or replace function public.enforce_member_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.members) >= 2 then
    raise exception 'MEMBER_LIMIT: 멤버는 최대 2명까지 등록할 수 있어' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists members_limit on public.members;
create trigger members_limit before insert on public.members
  for each row execute function public.enforce_member_limit();

-- RLS 재귀를 피하기 위해 security definer 로 멤버 여부만 확인한다.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

create or replace function public._require_member() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'NOT_MEMBER: 등록된 멤버만 사용할 수 있어' using errcode = '42501';
  end if;
end $$;

-- ───────────────────────── 공동 데이터 ─────────────────────────

create table if not exists public.stays (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  region       text not null default '' check (char_length(region) <= 50),
  address      text not null default '' check (char_length(address) <= 300),
  homepage_url text not null default '' check (homepage_url = '' or homepage_url ~* '^https?://[^\s]+\.[^\s]+$'),
  cover_url    text check (cover_url is null or cover_url ~* '^https?://[^\s]+$'),
  cover_path   text check (cover_path is null or char_length(cover_path) <= 300),
  memo         text not null default '' check (char_length(memo) <= 5000),
  version      integer not null default 1,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint stays_cover_one check (cover_url is null or cover_path is null)
);

create or replace function public.valid_facilities(f jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(f) = 'object'
     and not exists (
       select 1 from jsonb_each_text(f) e
       where e.key not in ('toilet','shower','heating','hotWater','bbq','cooking','fridge','microwave',
                           'cookware','parking','wifi','fire','spa','projector')
          or e.value not in ('yes','no','unknown'))
$$;

create table if not exists public.rooms (
  id             uuid primary key default gen_random_uuid(),
  stay_id        uuid not null references public.stays (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  base_guests    smallint check (base_guests between 1 and 99),
  max_guests     smallint check (max_guests between 1 and 99),
  size           text not null default '' check (char_length(size) <= 50),
  bed_type       text not null default '' check (char_length(bed_type) <= 100),
  description    text not null default '' check (char_length(description) <= 5000),
  facilities     jsonb not null default '{}'::jsonb check (public.valid_facilities(facilities)),
  mood_interior  text not null default '' check (char_length(mood_interior) <= 500),
  mood_view      text not null default '' check (char_length(mood_view) <= 500),
  mood_privacy   text not null default '' check (char_length(mood_privacy) <= 500),
  mood_christmas text not null default '' check (char_length(mood_christmas) <= 500),
  check_in_time  text not null default '' check (char_length(check_in_time) <= 20),
  check_out_time text not null default '' check (char_length(check_out_time) <= 20),
  booking_url    text not null default '' check (booking_url = '' or booking_url ~* '^https?://[^\s]+\.[^\s]+$'),
  cancel_policy  text not null default '' check (char_length(cancel_policy) <= 5000),
  notes          text not null default '' check (char_length(notes) <= 5000),
  pros           text not null default '' check (char_length(pros) <= 2000),
  cons           text not null default '' check (char_length(cons) <= 2000),
  version        integer not null default 1,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rooms_guests_order check (base_guests is null or max_guests is null or max_guests >= base_guests)
);
create index if not exists rooms_stay_id_idx on public.rooms (stay_id);

create table if not exists public.room_images (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  url          text check (url is null or url ~* '^https?://[^\s]+$'),
  storage_path text check (storage_path is null or char_length(storage_path) <= 300),
  sort_order   smallint not null default 0,
  constraint room_images_one_source check ((url is null) <> (storage_path is null))
);
create index if not exists room_images_room_id_idx on public.room_images (room_id, sort_order);

create table if not exists public.room_extras (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  kind          text not null check (kind in ('bbq', 'fire', 'custom')),
  name          text not null check (char_length(btrim(name)) between 1 and 50),
  default_price integer check (default_price >= 0),  -- null = 가격 미확인
  required      boolean not null default false,
  sort_order    smallint not null default 0
);
create index if not exists room_extras_room_id_idx on public.room_extras (room_id);
create unique index if not exists room_extras_one_bbq on public.room_extras (room_id) where kind = 'bbq';
create unique index if not exists room_extras_one_fire on public.room_extras (room_id) where kind = 'fire';

-- 날짜 구간별 가격 / 예약 가능 여부
create table if not exists public.room_rates (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  check_in     date not null,
  check_out    date not null,
  room_price   integer check (room_price >= 0),  -- null = 미입력 (0원으로 취급하지 않음)
  availability text not null default 'unchecked' check (availability in ('unchecked', 'available', 'unavailable')),
  checked_at   date,
  constraint room_rates_range check (check_out > check_in and check_out - check_in <= 30),
  constraint room_rates_unique unique (room_id, check_in, check_out)
);

-- 날짜별로 공통 기본값과 다른 추가금
create table if not exists public.rate_extra_prices (
  rate_id  uuid not null references public.room_rates (id) on delete cascade,
  extra_id uuid not null references public.room_extras (id) on delete cascade,
  price    integer not null check (price >= 0),
  primary key (rate_id, extra_id)
);

create or replace function public.check_rate_extra_same_room() returns trigger
language plpgsql as $$
begin
  if (select room_id from public.room_rates where id = new.rate_id)
     is distinct from (select room_id from public.room_extras where id = new.extra_id) then
    raise exception 'INVALID: 다른 객실의 추가금은 연결할 수 없어' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists rate_extra_same_room on public.rate_extra_prices;
create trigger rate_extra_same_room before insert or update on public.rate_extra_prices
  for each row execute function public.check_rate_extra_same_room();

-- 공동 여행 일정 (단일 행)
create table if not exists public.trip_settings (
  id         smallint primary key default 1 check (id = 1),
  check_in   date not null,
  check_out  date not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint trip_range check (check_out > check_in and check_out - check_in <= 30)
);
insert into public.trip_settings (id, check_in, check_out)
values (1, '2026-12-24', '2026-12-25')
on conflict (id) do nothing;

-- ───────────────────────── 사용자별 데이터 ─────────────────────────

create table if not exists public.favorites (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  memo       text not null default '' check (char_length(memo) <= 2000),
  priority   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

create table if not exists public.ratings (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  price      smallint check (price between 1 and 5),     -- 가격 및 가성비
  location   smallint check (location between 1 and 5),  -- 위치 및 접근성
  facility   smallint check (facility between 1 and 5),  -- 시설 및 편의성
  mood       smallint check (mood between 1 and 5),      -- 분위기 및 감성
  terms      smallint check (terms between 1 and 5),     -- 이용 조건
  updated_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

create table if not exists public.compare_items (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id  uuid not null references public.rooms (id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  primary key (user_id, room_id),
  constraint compare_items_position unique (user_id, position)
);

create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  compare_bbq  boolean not null default false,
  compare_fire boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- 비교 화면에서 선택한 기타 선택 추가금
create table if not exists public.compare_extra_selections (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  extra_id uuid not null references public.room_extras (id) on delete cascade,
  primary key (user_id, extra_id)
);

-- ───────────────────────── updated_at 트리거 ─────────────────────────

create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists stays_touch on public.stays;
create trigger stays_touch before update on public.stays for each row execute function public.touch_row();
drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_row();

-- ───────────────────────── RLS ─────────────────────────

alter table public.members enable row level security;
alter table public.stays enable row level security;
alter table public.rooms enable row level security;
alter table public.room_images enable row level security;
alter table public.room_extras enable row level security;
alter table public.room_rates enable row level security;
alter table public.rate_extra_prices enable row level security;
alter table public.trip_settings enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.compare_items enable row level security;
alter table public.user_settings enable row level security;
alter table public.compare_extra_selections enable row level security;

do $$
declare t text;
begin
  -- 기존 정책 제거 후 재생성 (재실행 가능)
  for t in select unnest(array['members','stays','rooms','room_images','room_extras','room_rates',
                               'rate_extra_prices','trip_settings','favorites','ratings','compare_items',
                               'user_settings','compare_extra_selections'])
  loop
    execute (select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
             from pg_policies where schemaname = 'public' and tablename = t);
  end loop;

  -- 공동 데이터: 멤버 전체 CRUD
  foreach t in array array['stays','rooms','room_images','room_extras','room_rates','rate_extra_prices'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
                   t || '_members_all', t);
  end loop;
end $$;

-- members: 멤버끼리 조회, 본인 표시 이름만 수정. 추가/삭제는 SQL Editor(관리자)에서만.
create policy members_select on public.members for select to authenticated using (public.is_member());
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 공동 일정: 조회/수정
create policy trip_select on public.trip_settings for select to authenticated using (public.is_member());
create policy trip_update on public.trip_settings for update to authenticated
  using (public.is_member()) with check (public.is_member());

-- 찜/비교/설정: 본인 것만
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy compare_items_own on public.compare_items for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy compare_extra_selections_own on public.compare_extra_selections for all to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

-- 평가: 멤버끼리 서로 조회 가능, 작성/수정/삭제는 본인 것만
create policy ratings_select on public.ratings for select to authenticated using (public.is_member());
create policy ratings_insert_own on public.ratings for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());
create policy ratings_update_own on public.ratings for update to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy ratings_delete_own on public.ratings for delete to authenticated
  using (user_id = auth.uid() and public.is_member());

-- 권한: anon 은 아무것도 못 하게, authenticated 는 RLS 범위 안에서만
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ───────────────────────── Storage (숙소 사진) ─────────────────────────
-- 공개(public) 버킷: 사진 URL 을 아는 사람은 볼 수 있지만, 업로드/삭제는 멤버만 가능.
-- 파일 경로는 추측하기 어려운 UUID 로 생성한다. 5MB 제한, jpg/png/webp 만 허용.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stay-photos', 'stay-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stay_photos_select on storage.objects;
drop policy if exists stay_photos_insert on storage.objects;
drop policy if exists stay_photos_update on storage.objects;
drop policy if exists stay_photos_delete on storage.objects;
create policy stay_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'stay-photos' and public.is_member());
create policy stay_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'stay-photos' and public.is_member());
create policy stay_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'stay-photos' and public.is_member());
create policy stay_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'stay-photos' and public.is_member());

-- ═════════════════════════ RPC (security invoker → RLS 적용) ═════════════════════════

create or replace function public._image_json(p_url text, p_path text) returns jsonb
language sql immutable as $$
  select case
    when p_path is not null then jsonb_build_object('type', 'storage', 'path', p_path)
    when p_url is not null then jsonb_build_object('type', 'url', 'url', p_url)
    else null end
$$;

create or replace function public._stay_json(s public.stays) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'region', s.region, 'address', s.address,
    'homepageUrl', s.homepage_url, 'coverImage', public._image_json(s.cover_url, s.cover_path),
    'memo', s.memo, 'version', s.version,
    'createdAt', s.created_at, 'updatedAt', s.updated_at, 'updatedBy', s.updated_by)
$$;

create or replace function public._room_json(p_room_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'stayId', r.stay_id, 'name', r.name, 'version', r.version,
    'baseGuests', r.base_guests, 'maxGuests', r.max_guests, 'size', r.size, 'bedType', r.bed_type,
    'description', r.description, 'facilities', r.facilities,
    'mood', jsonb_build_object('interior', r.mood_interior, 'view', r.mood_view,
                               'privacy', r.mood_privacy, 'christmas', r.mood_christmas),
    'checkIn', r.check_in_time, 'checkOut', r.check_out_time, 'bookingUrl', r.booking_url,
    'cancelPolicy', r.cancel_policy, 'notes', r.notes, 'pros', r.pros, 'cons', r.cons,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'updatedBy', r.updated_by,
    'images', coalesce((select jsonb_agg(public._image_json(i.url, i.storage_path) order by i.sort_order)
                        from room_images i where i.room_id = r.id), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', e.name,
                                         'defaultPrice', e.default_price, 'required', e.required)
                                         order by e.sort_order)
                        from room_extras e where e.room_id = r.id), '[]'::jsonb),
    'rates', coalesce((select jsonb_object_agg(
                          to_char(rt.check_in, 'YYYY-MM-DD') || '_' || to_char(rt.check_out, 'YYYY-MM-DD'),
                          jsonb_build_object(
                            'roomPrice', rt.room_price,
                            'availability', rt.availability,
                            'checkedAt', coalesce(to_char(rt.checked_at, 'YYYY-MM-DD'), ''),
                            'extraPrices', coalesce((select jsonb_object_agg(p.extra_id, p.price)
                                                     from rate_extra_prices p where p.rate_id = rt.id), '{}'::jsonb)))
                       from room_rates rt where rt.room_id = r.id), '{}'::jsonb))
  from rooms r where r.id = p_room_id
$$;

-- 앱 초기 로딩: 화면에 필요한 모든 데이터를 한 번에
create or replace function public.get_app_state() returns jsonb
language plpgsql stable set search_path = public as $$
begin
  perform public._require_member();
  return jsonb_build_object(
    'me', (select jsonb_build_object('id', user_id, 'displayName', display_name) from members where user_id = auth.uid()),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'displayName', display_name) order by created_at), '[]')
                from members),
    'trip', (select jsonb_build_object('checkIn', to_char(check_in, 'YYYY-MM-DD'), 'checkOut', to_char(check_out, 'YYYY-MM-DD'),
                                       'updatedAt', updated_at, 'updatedBy', updated_by)
             from trip_settings where id = 1),
    'stays', (select coalesce(jsonb_agg(public._stay_json(s) order by s.created_at desc), '[]') from stays s),
    'rooms', (select coalesce(jsonb_agg(public._room_json(r.id) order by r.created_at), '[]') from rooms r),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('roomId', room_id, 'memo', memo, 'addedAt', created_at)
                                            order by priority, created_at), '[]')
                  from favorites where user_id = auth.uid()),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'roomId', room_id,
                  'price', price, 'location', location, 'facility', facility, 'mood', mood, 'terms', terms)), '[]')
                from ratings),
    'compare', (select coalesce(jsonb_agg(room_id order by position), '[]') from compare_items where user_id = auth.uid()),
    'compareOptions', jsonb_build_object(
       'bbq', coalesce((select compare_bbq from user_settings where user_id = auth.uid()), false),
       'fire', coalesce((select compare_fire from user_settings where user_id = auth.uid()), false),
       'extraIds', (select coalesce(jsonb_agg(extra_id), '[]') from compare_extra_selections where user_id = auth.uid()))
  );
end $$;

-- 숙소 저장 (id 없으면 생성, 있으면 version 확인 후 수정)
create or replace function public.save_stay(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_old_path text;
  v_cover jsonb := p -> 'coverImage';
  v_url text := case when v_cover ->> 'type' = 'url' then nullif(btrim(v_cover ->> 'url'), '') end;
  v_path text := case when v_cover ->> 'type' = 'storage' then nullif(v_cover ->> 'path', '') end;
  v_removed text[] := '{}';
begin
  perform public._require_member();
  if coalesce(p ->> 'id', '') = '' then
    insert into stays (name, region, address, homepage_url, cover_url, cover_path, memo)
    values (btrim(p ->> 'name'), coalesce(btrim(p ->> 'region'), ''), coalesce(btrim(p ->> 'address'), ''),
            coalesce(btrim(p ->> 'homepageUrl'), ''), v_url, v_path, coalesce(p ->> 'memo', ''))
    returning id into v_id;
  else
    v_id := (p ->> 'id')::uuid;
    select cover_path into v_old_path from stays where id = v_id;
    update stays set
      name = btrim(p ->> 'name'), region = coalesce(btrim(p ->> 'region'), ''),
      address = coalesce(btrim(p ->> 'address'), ''), homepage_url = coalesce(btrim(p ->> 'homepageUrl'), ''),
      cover_url = v_url, cover_path = v_path, memo = coalesce(p ->> 'memo', ''),
      version = version + 1
    where id = v_id and version = (p ->> 'version')::int;
    if not found then
      if exists (select 1 from stays where id = v_id) then
        raise exception 'CONFLICT: 다른 사람이 먼저 수정했어' using errcode = 'P0409';
      end if;
      raise exception 'NOT_FOUND: 숙소를 찾을 수 없어' using errcode = 'P0404';
    end if;
    if v_old_path is not null and v_old_path is distinct from v_path then
      v_removed := array[v_old_path];
    end if;
  end if;
  return jsonb_build_object('stay', (select public._stay_json(s) from stays s where s.id = v_id),
                            'removedPaths', to_jsonb(v_removed));
end $$;

create or replace function public.stay_delete_impact(p_stay_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member();
  return jsonb_build_object(
    'rooms', (select count(*) from rooms where stay_id = p_stay_id),
    'favorites', (select count(*) from favorites f join rooms r on r.id = f.room_id where r.stay_id = p_stay_id),
    'compares', (select count(*) from compare_items c join rooms r on r.id = c.room_id where r.stay_id = p_stay_id),
    'ratings', (select count(*) from ratings g join rooms r on r.id = g.room_id where r.stay_id = p_stay_id));
end $$;

-- 숙소 삭제: 소속 객실·가격·찜·비교·평가는 FK cascade 로 함께 삭제된다.
-- 반환하는 removedPaths 는 클라이언트가 Storage 에서 지운다.
create or replace function public.delete_stay(p_stay_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare v_paths text[];
begin
  perform public._require_member();
  select coalesce(array_agg(p), '{}') into v_paths from (
    select cover_path p from stays where id = p_stay_id and cover_path is not null
    union all
    select i.storage_path from room_images i join rooms r on r.id = i.room_id
    where r.stay_id = p_stay_id and i.storage_path is not null) x;
  delete from stays where id = p_stay_id;
  if not found then raise exception 'NOT_FOUND: 숙소를 찾을 수 없어' using errcode = 'P0404'; end if;
  return jsonb_build_object('removedPaths', to_jsonb(v_paths));
end $$;

-- 객실 저장: 기본 정보 + 사진 + 추가금 + 시설 + 분위기 + 날짜별 가격을 하나의 트랜잭션으로 저장
create or replace function public.save_room(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_id uuid;
  v_old_paths text[];
  v_new_paths text[];
  v_extra jsonb;
  v_idx int;
  v_extra_id uuid;
  v_map jsonb := '{}';
  v_keep uuid[] := '{}';
  v_key text;
  v_rate jsonb;
  v_rate_id uuid;
  v_rate_keep uuid[] := '{}';
  v_ep_key text;
  v_ep_val jsonb;
begin
  perform public._require_member();

  if coalesce(p ->> 'id', '') = '' then
    insert into rooms (stay_id, name) values ((p ->> 'stayId')::uuid, btrim(p ->> 'name')) returning id into v_id;
  else
    v_id := (p ->> 'id')::uuid;
    perform 1 from rooms where id = v_id and version = (p ->> 'version')::int for update;
    if not found then
      if exists (select 1 from rooms where id = v_id) then
        raise exception 'CONFLICT: 다른 사람이 먼저 수정했어' using errcode = 'P0409';
      end if;
      raise exception 'NOT_FOUND: 객실을 찾을 수 없어' using errcode = 'P0404';
    end if;
  end if;

  update rooms set
    name = btrim(p ->> 'name'),
    base_guests = (p ->> 'baseGuests')::smallint,
    max_guests = (p ->> 'maxGuests')::smallint,
    size = coalesce(btrim(p ->> 'size'), ''),
    bed_type = coalesce(btrim(p ->> 'bedType'), ''),
    description = coalesce(p ->> 'description', ''),
    facilities = coalesce(p -> 'facilities', '{}'::jsonb),
    mood_interior = coalesce(p -> 'mood' ->> 'interior', ''),
    mood_view = coalesce(p -> 'mood' ->> 'view', ''),
    mood_privacy = coalesce(p -> 'mood' ->> 'privacy', ''),
    mood_christmas = coalesce(p -> 'mood' ->> 'christmas', ''),
    check_in_time = coalesce(btrim(p ->> 'checkIn'), ''),
    check_out_time = coalesce(btrim(p ->> 'checkOut'), ''),
    booking_url = coalesce(btrim(p ->> 'bookingUrl'), ''),
    cancel_policy = coalesce(p ->> 'cancelPolicy', ''),
    notes = coalesce(p ->> 'notes', ''),
    version = case when coalesce(p ->> 'id', '') = '' then version else version + 1 end
  where id = v_id;

  -- 사진 (순서 포함 전체 교체)
  select coalesce(array_agg(storage_path), '{}') into v_old_paths
    from room_images where room_id = v_id and storage_path is not null;
  delete from room_images where room_id = v_id;
  insert into room_images (room_id, url, storage_path, sort_order)
  select v_id,
         case when img ->> 'type' = 'url' then btrim(img ->> 'url') end,
         case when img ->> 'type' = 'storage' then img ->> 'path' end,
         (ord - 1)::smallint
  from jsonb_array_elements(coalesce(p -> 'images', '[]'::jsonb)) with ordinality as t(img, ord)
  where img ->> 'type' in ('url', 'storage');
  select coalesce(array_agg(storage_path), '{}') into v_new_paths
    from room_images where room_id = v_id and storage_path is not null;

  -- 추가금: 1단계 id 매핑 (클라이언트 임시 id → uuid)
  for v_extra in select * from jsonb_array_elements(coalesce(p -> 'extras', '[]'::jsonb)) loop
    v_extra_id := case when v_extra ->> 'id' ~* uuid_re then (v_extra ->> 'id')::uuid end;
    if v_extra_id is not null and exists (select 1 from room_extras where id = v_extra_id and room_id <> v_id) then
      v_extra_id := null;
    end if;
    v_extra_id := coalesce(v_extra_id, gen_random_uuid());
    v_map := v_map || jsonb_build_object(coalesce(v_extra ->> 'id', v_extra_id::text), v_extra_id::text);
    v_keep := v_keep || v_extra_id;
  end loop;
  delete from room_extras where room_id = v_id and not (id = any (v_keep));
  -- 2단계 저장
  v_idx := 0;
  for v_extra in select * from jsonb_array_elements(coalesce(p -> 'extras', '[]'::jsonb)) loop
    v_extra_id := v_keep[v_idx + 1];
    insert into room_extras (id, room_id, kind, name, default_price, required, sort_order)
    values (v_extra_id, v_id, coalesce(v_extra ->> 'kind', 'custom'), btrim(v_extra ->> 'name'),
            (v_extra ->> 'defaultPrice')::int, coalesce((v_extra ->> 'required')::boolean, false), v_idx)
    on conflict (id) do update set kind = excluded.kind, name = excluded.name,
      default_price = excluded.default_price, required = excluded.required, sort_order = excluded.sort_order;
    v_idx := v_idx + 1;
  end loop;

  -- 날짜별 가격 (키: YYYY-MM-DD_YYYY-MM-DD)
  for v_key, v_rate in select * from jsonb_each(coalesce(p -> 'rates', '{}'::jsonb)) loop
    insert into room_rates (room_id, check_in, check_out, room_price, availability, checked_at)
    values (v_id, split_part(v_key, '_', 1)::date, split_part(v_key, '_', 2)::date,
            (v_rate ->> 'roomPrice')::int, coalesce(v_rate ->> 'availability', 'unchecked'),
            nullif(v_rate ->> 'checkedAt', '')::date)
    on conflict (room_id, check_in, check_out) do update set
      room_price = excluded.room_price, availability = excluded.availability, checked_at = excluded.checked_at
    returning id into v_rate_id;
    v_rate_keep := v_rate_keep || v_rate_id;
    delete from rate_extra_prices where rate_id = v_rate_id;
    for v_ep_key, v_ep_val in select * from jsonb_each(coalesce(v_rate -> 'extraPrices', '{}'::jsonb)) loop
      if jsonb_typeof(v_ep_val) = 'number' and v_map ? v_ep_key then
        insert into rate_extra_prices (rate_id, extra_id, price)
        values (v_rate_id, (v_map ->> v_ep_key)::uuid, (v_ep_val #>> '{}')::int);
      end if;
    end loop;
  end loop;
  delete from room_rates where room_id = v_id and not (id = any (v_rate_keep));

  return jsonb_build_object(
    'room', public._room_json(v_id),
    'extraIdMap', v_map,
    'removedPaths', to_jsonb(array(select unnest(v_old_paths) except select unnest(v_new_paths))));
end $$;

create or replace function public.delete_room(p_room_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare v_paths text[];
begin
  perform public._require_member();
  select coalesce(array_agg(storage_path), '{}') into v_paths
    from room_images where room_id = p_room_id and storage_path is not null;
  delete from rooms where id = p_room_id;
  if not found then raise exception 'NOT_FOUND: 객실을 찾을 수 없어' using errcode = 'P0404'; end if;
  return jsonb_build_object('removedPaths', to_jsonb(v_paths));
end $$;

-- 비교 화면의 장단점 메모 (공유). 객실 폼의 version 과는 별개로 저장한다.
create or replace function public.update_room_notes(p_room_id uuid, p_pros text, p_cons text) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  update rooms set pros = coalesce(p_pros, ''), cons = coalesce(p_cons, '') where id = p_room_id;
  if not found then raise exception 'NOT_FOUND: 객실을 찾을 수 없어' using errcode = 'P0404'; end if;
end $$;

-- ───── 사용자별 ─────

create or replace function public.set_favorite(p_room_id uuid, p_on boolean) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  if p_on then
    insert into favorites (user_id, room_id, priority)
    values (auth.uid(), p_room_id,
            coalesce((select max(priority) + 1 from favorites where user_id = auth.uid()), 0))
    on conflict (user_id, room_id) do nothing;
  else
    delete from favorites where user_id = auth.uid() and room_id = p_room_id;
  end if;
end $$;

create or replace function public.update_favorite_memo(p_room_id uuid, p_memo text) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  update favorites set memo = coalesce(p_memo, '') where user_id = auth.uid() and room_id = p_room_id;
  if not found then raise exception 'NOT_FOUND: 찜한 객실이 아니야' using errcode = 'P0404'; end if;
end $$;

create or replace function public.reorder_favorites(p_room_ids uuid[]) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  update favorites f set priority = x.ord - 1
  from unnest(p_room_ids) with ordinality as x(room_id, ord)
  where f.user_id = auth.uid() and f.room_id = x.room_id;
end $$;

create or replace function public.set_rating(p_room_id uuid, p_criterion text, p_score integer) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  if p_criterion not in ('price', 'location', 'facility', 'mood', 'terms') then
    raise exception 'INVALID: 알 수 없는 평가 항목' using errcode = '22023';
  end if;
  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'INVALID: 점수는 1~5 사이여야 해' using errcode = '22023';
  end if;
  insert into ratings (user_id, room_id) values (auth.uid(), p_room_id) on conflict do nothing;
  update ratings set
    price    = case when p_criterion = 'price'    then p_score else price end,
    location = case when p_criterion = 'location' then p_score else location end,
    facility = case when p_criterion = 'facility' then p_score else facility end,
    mood     = case when p_criterion = 'mood'     then p_score else mood end,
    terms    = case when p_criterion = 'terms'    then p_score else terms end,
    updated_at = now()
  where user_id = auth.uid() and room_id = p_room_id;
end $$;

create or replace function public.set_compare(p_room_ids uuid[]) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  if coalesce(array_length(p_room_ids, 1), 0) > 3 then
    raise exception 'INVALID: 비교는 최대 3개까지 가능해' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_room_ids) x) <> coalesce(array_length(p_room_ids, 1), 0) then
    raise exception 'INVALID: 같은 객실이 중복되었어' using errcode = '22023';
  end if;
  delete from compare_items where user_id = auth.uid();
  insert into compare_items (user_id, room_id, position)
  select auth.uid(), x.room_id, (x.ord - 1)::smallint
  from unnest(p_room_ids) with ordinality as x(room_id, ord);
end $$;

create or replace function public.set_compare_options(p_bbq boolean, p_fire boolean, p_extra_ids uuid[]) returns void
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  insert into user_settings (user_id, compare_bbq, compare_fire) values (auth.uid(), p_bbq, p_fire)
  on conflict (user_id) do update set compare_bbq = excluded.compare_bbq, compare_fire = excluded.compare_fire,
                                      updated_at = now();
  delete from compare_extra_selections where user_id = auth.uid();
  insert into compare_extra_selections (user_id, extra_id)
  select distinct auth.uid(), x from unnest(coalesce(p_extra_ids, '{}')) x
  where exists (select 1 from room_extras e where e.id = x);
end $$;

create or replace function public.set_trip(p_check_in date, p_check_out date) returns jsonb
language plpgsql set search_path = public as $$
begin
  perform public._require_member();
  update trip_settings set check_in = p_check_in, check_out = p_check_out,
                           updated_by = auth.uid(), updated_at = now()
  where id = 1;
  return (select jsonb_build_object('checkIn', to_char(check_in, 'YYYY-MM-DD'), 'checkOut', to_char(check_out, 'YYYY-MM-DD'),
                                    'updatedAt', updated_at, 'updatedBy', updated_by)
          from trip_settings where id = 1);
end $$;

-- ───── 백업 복원 / localStorage 이전 ─────
-- p: { stays:[...], rooms:[...], favorites:[...], compare:[...], compareOptions:{...}, trip:{...} }
-- (앱의 JSON 백업 형식. 로컬 이미지는 클라이언트가 먼저 Storage 에 올리고 {type:'storage'} 로 바꿔 보낸다)
-- 기존 공동 데이터를 모두 지우고(두 사람의 찜/평가/비교 포함) 백업 내용으로 교체한다.
create or replace function public.import_backup(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_old_paths text[];
  v_stay jsonb;
  v_room jsonb;
  v_res jsonb;
  v_stay_map jsonb := '{}';
  v_room_map jsonb := '{}';
  v_extra_maps jsonb := '{}';
  v_fav jsonb;
  v_ids uuid[];
  v_extra_ids uuid[] := '{}';
  v_room_key text;
  v_sel jsonb;
  v_extra_key text;
  v_crit text;
begin
  perform public._require_member();
  if jsonb_typeof(p -> 'stays') <> 'array' or jsonb_typeof(p -> 'rooms') <> 'array' then
    raise exception 'INVALID: 백업 형식이 올바르지 않아' using errcode = '22023';
  end if;

  select coalesce(array_agg(x), '{}') into v_old_paths from (
    select cover_path x from stays where cover_path is not null
    union all select storage_path from room_images where storage_path is not null) t;
  delete from stays;

  for v_stay in select * from jsonb_array_elements(p -> 'stays') loop
    v_res := public.save_stay(v_stay - 'id' - 'version');
    v_stay_map := v_stay_map || jsonb_build_object(v_stay ->> 'id', v_res -> 'stay' ->> 'id');
  end loop;

  for v_room in select * from jsonb_array_elements(p -> 'rooms') loop
    if not (v_stay_map ? (v_room ->> 'stayId')) then continue; end if;
    v_res := public.save_room((v_room - 'id' - 'version') || jsonb_build_object('stayId', v_stay_map ->> (v_room ->> 'stayId')));
    v_room_map := v_room_map || jsonb_build_object(v_room ->> 'id', v_res -> 'room' ->> 'id');
    v_extra_maps := v_extra_maps || jsonb_build_object(v_room ->> 'id', v_res -> 'extraIdMap');
    update rooms set pros = coalesce(v_room ->> 'pros', ''), cons = coalesce(v_room ->> 'cons', '')
      where id = (v_res -> 'room' ->> 'id')::uuid;
    -- 객실에 포함된 평가는 가져오는 사람의 평가로 복원
    if jsonb_typeof(v_room -> 'ratings') = 'object' then
      foreach v_crit in array array['price', 'location', 'facility', 'mood', 'terms'] loop
        if jsonb_typeof(v_room -> 'ratings' -> v_crit) = 'number' then
          perform public.set_rating((v_res -> 'room' ->> 'id')::uuid, v_crit, (v_room -> 'ratings' ->> v_crit)::int);
        end if;
      end loop;
    end if;
  end loop;

  for v_fav in select * from jsonb_array_elements(coalesce(p -> 'favorites', '[]'::jsonb)) loop
    if v_room_map ? (v_fav ->> 'roomId') then
      perform public.set_favorite((v_room_map ->> (v_fav ->> 'roomId'))::uuid, true);
      perform public.update_favorite_memo((v_room_map ->> (v_fav ->> 'roomId'))::uuid, coalesce(v_fav ->> 'memo', ''));
    end if;
  end loop;

  select coalesce(array_agg((v_room_map ->> x)::uuid), '{}') into v_ids
  from jsonb_array_elements_text(coalesce(p -> 'compare', '[]'::jsonb)) x where v_room_map ? x;
  perform public.set_compare(v_ids[1:3]);

  for v_room_key, v_sel in select * from jsonb_each(coalesce(p -> 'compareOptions' -> 'custom', '{}'::jsonb)) loop
    if jsonb_typeof(v_sel) <> 'object' or not (v_extra_maps ? v_room_key) then continue; end if;
    for v_extra_key in select key from jsonb_each(v_sel) where value = 'true'::jsonb loop
      if v_extra_maps -> v_room_key ? v_extra_key then
        v_extra_ids := v_extra_ids || (v_extra_maps -> v_room_key ->> v_extra_key)::uuid;
      end if;
    end loop;
  end loop;
  perform public.set_compare_options(coalesce((p -> 'compareOptions' ->> 'bbq')::boolean, false),
                                     coalesce((p -> 'compareOptions' ->> 'fire')::boolean, false), v_extra_ids);

  if p -> 'trip' ->> 'checkIn' is not null and p -> 'trip' ->> 'checkOut' is not null then
    perform public.set_trip((p -> 'trip' ->> 'checkIn')::date, (p -> 'trip' ->> 'checkOut')::date);
  end if;

  return jsonb_build_object(
    'stays', jsonb_array_length(p -> 'stays'),
    'rooms', (select count(*) from rooms),
    'removedPaths', to_jsonb(v_old_paths));
end $$;

revoke all on all functions in schema public from anon, public;
grant execute on function
  public.is_member(), public.get_app_state(), public.save_stay(jsonb), public.stay_delete_impact(uuid),
  public.delete_stay(uuid), public.save_room(jsonb), public.delete_room(uuid),
  public.update_room_notes(uuid, text, text), public.set_favorite(uuid, boolean),
  public.update_favorite_memo(uuid, text), public.reorder_favorites(uuid[]),
  public.set_rating(uuid, text, integer), public.set_compare(uuid[]),
  public.set_compare_options(boolean, boolean, uuid[]), public.set_trip(date, date),
  public.import_backup(jsonb)
to authenticated;
-- 내부 헬퍼 / 트리거 함수도 RLS 정책 평가와 트리거 실행에 필요하다.
grant execute on function public._require_member(), public.valid_facilities(jsonb), public._image_json(text, text),
  public._stay_json(public.stays), public._room_json(uuid), public.touch_row(),
  public.check_rate_extra_same_room(), public.enforce_member_limit()
to authenticated;
