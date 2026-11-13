-- ════════════════════════════════════════════════════════════════════
-- 숙소 유형(글램핑 / 풀빌라 / 카라반 …) 추가
--
-- 적용 방법: 20261113000000_init.sql 을 실행한 프로젝트에서
--            Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하다 (컬럼은 없을 때만 추가, 함수는 create or replace).
-- 기존 숙소 데이터는 지우거나 바꾸지 않는다. 기존 숙소의 유형은 '' (미분류) 로 시작한다.
--
-- RLS: stays 테이블의 기존 정책(멤버만 조회·수정)이 새 컬럼에도 그대로 적용된다.
-- 권한: authenticated 의 테이블 단위 권한이 새 컬럼에도 그대로 적용된다 (anon 은 여전히 0).
-- ════════════════════════════════════════════════════════════════════

alter table public.stays
  add column if not exists stay_type text not null default ''
  constraint stays_stay_type_valid
  check (stay_type in ('', 'glamping', 'poolvilla', 'caravan', 'camping', 'pension', 'hotel', 'mixed', 'other'));

-- 숙소 JSON 에 stayType 추가 (나머지 필드는 기존과 동일)
create or replace function public._stay_json(s public.stays) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'region', s.region, 'address', s.address, 'stayType', s.stay_type,
    'homepageUrl', s.homepage_url, 'coverImage', public._image_json(s.cover_url, s.cover_path),
    'memo', s.memo, 'version', s.version,
    'createdAt', s.created_at, 'updatedAt', s.updated_at, 'updatedBy', s.updated_by)
$$;

-- 숙소 저장: stayType 저장 추가 (나머지 동작은 기존과 동일)
create or replace function public.save_stay(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_old_path text;
  v_cover jsonb := p -> 'coverImage';
  v_url text := case when v_cover ->> 'type' = 'url' then nullif(btrim(v_cover ->> 'url'), '') end;
  v_path text := case when v_cover ->> 'type' = 'storage' then nullif(v_cover ->> 'path', '') end;
  v_type text := coalesce(p ->> 'stayType', '');
  v_removed text[] := '{}';
begin
  perform public._require_member();
  if coalesce(p ->> 'id', '') = '' then
    insert into stays (name, region, address, homepage_url, cover_url, cover_path, memo, stay_type)
    values (btrim(p ->> 'name'), coalesce(btrim(p ->> 'region'), ''), coalesce(btrim(p ->> 'address'), ''),
            coalesce(btrim(p ->> 'homepageUrl'), ''), v_url, v_path, coalesce(p ->> 'memo', ''), v_type)
    returning id into v_id;
  else
    v_id := (p ->> 'id')::uuid;
    select cover_path into v_old_path from stays where id = v_id;
    update stays set
      name = btrim(p ->> 'name'), region = coalesce(btrim(p ->> 'region'), ''),
      address = coalesce(btrim(p ->> 'address'), ''), homepage_url = coalesce(btrim(p ->> 'homepageUrl'), ''),
      cover_url = v_url, cover_path = v_path, memo = coalesce(p ->> 'memo', ''), stay_type = v_type,
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

-- create or replace 는 기존 실행 권한을 유지하지만, 처음 만들어지는 환경을 위해 다시 명시한다
revoke all on function public._stay_json(public.stays), public.save_stay(jsonb) from anon, public;
grant execute on function public._stay_json(public.stays), public.save_stay(jsonb) to authenticated;
