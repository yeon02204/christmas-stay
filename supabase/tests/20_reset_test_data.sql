-- ⚠️ 로컬 테스트 전용: 테스트 DB 데이터를 비우고 테스트 계정(a/b 멤버, x 비멤버)을 만든다.
delete from public.stays;
delete from public.compare_extra_selections; delete from public.user_settings;
update public.trip_settings set check_in='2026-12-24', check_out='2026-12-25';
delete from storage.objects;
delete from public.members; delete from auth.users;
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@test.local'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@test.local'),
 ('cccccccc-0000-0000-0000-000000000003','x@test.local');
insert into public.members values ('aaaaaaaa-0000-0000-0000-000000000001','정연', now()), ('bbbbbbbb-0000-0000-0000-000000000002','짝꿍', now()+interval '1s');
