-- ════════════════════════════════════════════════════════════════════
-- 예약 링크 일괄 업데이트용 함수
--
-- 적용 방법: 앞의 마이그레이션을 실행한 프로젝트에서 SQL Editor 에 전체 붙여넣고 Run.
-- 여러 번 실행해도 안전하다 (create or replace). 테이블 구조·데이터·RLS 는 바꾸지 않는다.
--
-- 예약 링크는 객실(rooms.booking_url)에 저장된다. 숙소 공통 링크는 그 숙소의 모든 객실에 같은 값을 넣는다.
-- 이 함수는 rooms.booking_url 만 바꾼다. (버전·수정 시각·수정자는 기존 규칙대로 갱신되어,
-- 그사이 상대가 같은 객실 수정 화면을 열어 두었다면 저장할 때 충돌 확인창이 뜬다)
-- 사진·가격·추가금·시설·찜·평가·비교 목록은 건드리지 않는다.
--
-- security invoker → 호출한 사람의 권한(RLS)으로 실행: 멤버만 가능, anon 은 실행 권한 없음.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.set_stay_booking_link(p_stay_id uuid, p_url text, p_only_empty boolean default false)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
  v_rooms int;
  v_updated int;
begin
  perform public._require_member();
  if v_url !~* '^https?://[^\s]+\.[^\s]+$' then
    raise exception 'INVALID: 예약 링크는 http:// 또는 https:// 로 시작하는 주소여야 해' using errcode = '22023';
  end if;
  if not exists (select 1 from stays where id = p_stay_id) then
    raise exception 'NOT_FOUND: 숙소를 찾을 수 없어' using errcode = 'P0404';
  end if;
  select count(*) into v_rooms from rooms where stay_id = p_stay_id;
  update rooms set booking_url = v_url, version = version + 1
  where stay_id = p_stay_id
    and booking_url is distinct from v_url
    and (not coalesce(p_only_empty, false) or booking_url = '');
  get diagnostics v_updated = row_count;
  return jsonb_build_object('rooms', v_rooms, 'updated', v_updated);
end $$;

revoke all on function public.set_stay_booking_link(uuid, text, boolean) from anon, public;
grant execute on function public.set_stay_booking_link(uuid, text, boolean) to authenticated;
