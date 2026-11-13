"""
로컬 E2E 시나리오 테스트 (Playwright + 로컬 Supabase 대역 서버)
사전 조건: PostgreSQL 에 스키마 적용 + 테스트 계정, scripts/mock-supabase 실행, vite dev(:5173)
실행: python3 scripts/e2e/e2e_test.py
"""
import json
import os
import re
import sys
import time

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://localhost:5173')
IMG = os.environ.get('E2E_IMG_DIR', '/tmp/e2e')
SHOTS = os.environ.get('E2E_SHOTS', '/tmp/e2e/shots')
os.makedirs(SHOTS, exist_ok=True)
results = []
_current = [None]
console_errors = []


def step(name):
    def deco(fn):
        def run(*a, **k):
            t = time.time()
            try:
                fn(*a, **k)
                results.append(('PASS', name, f'{time.time()-t:.1f}s'))
                print(f'  ✓ {name}')
            except Exception as e:
                for pg in (a[0:1] if a else []):
                    pass
                try:
                    _current[0].screenshot(path=f'{SHOTS}/FAIL.png', full_page=True)
                except Exception:
                    pass
                results.append(('FAIL', name, str(e).splitlines()[0][:200]))
                print(f'  ✗ {name}: {e}')
                raise
        return run
    return deco


def shot(page, name):
    page.screenshot(path=f'{SHOTS}/{name}.png', full_page=True)


def login(page, email):
    page.goto(BASE)
    page.get_by_label('이메일').fill(email)
    page.get_by_label('비밀번호').fill('test1234')
    page.get_by_role('button', name='로그인').click()


def toast(page, text):
    expect(page.get_by_role('status').filter(has_text=text).first).to_be_visible(timeout=8000)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', accept_downloads=True)
        page = ctx.new_page()
        _current[0] = page
        page.on('console', lambda m: m.type == 'error' and console_errors.append(m.text))
        page.on('pageerror', lambda e: console_errors.append(f'pageerror: {e}'))

        @step('로그인 실패 메시지 / 로그인 성공')
        def s_login():
            page.goto(BASE)
            page.get_by_label('이메일').fill('a@test.local')
            page.get_by_label('비밀번호').fill('wrong')
            page.get_by_role('button', name='로그인').click()
            expect(page.get_by_role('alert')).to_contain_text('맞지 않아')
            page.get_by_label('비밀번호').fill('test1234')
            page.get_by_role('button', name='로그인').click()
            expect(page.get_by_text('우리의 겨울 여행을 찾아서')).to_be_visible()
        s_login()

        @step('숙소 0개 빈 화면')
        def s_empty():
            expect(page.get_by_text('아직 등록된 숙소가 없어!')).to_be_visible()
            expect(page.get_by_text('마음에 드는 글램핑 숙소를 하나씩 추가해 보자.')).to_be_visible()
            expect(page.locator('article')).to_have_count(0)
            shot(page, '01_home_empty')
        s_empty()

        @step('숙소 등록 (URL 자동 https, 대표사진 업로드) → 객실 추가로 이동')
        def s_stay():
            page.get_by_role('link', name='숙소 등록').first.click()
            page.get_by_label('숙소명').fill('별빛 글램핑')
            page.get_by_label('지역').fill('가평')
            page.get_by_label('숙소 홈페이지 URL').fill('starlight-glamping.example.com')
            page.get_by_label('주소').fill('경기도 가평군 테스트로 1')
            page.locator('input[type=file]').set_input_files(f'{IMG}/cover.jpg')
            toast(page, '업로드했어')
            page.get_by_label('숙소 메모').fill('후기 좋음')
            page.get_by_role('button', name='등록하고 객실 추가').click()
            toast(page, '숙소를 등록했어')
            expect(page).to_have_url(re.compile(r'/rooms/new\?first=1'))
            expect(page.get_by_text('이제 객실을 추가해 보자')).to_be_visible()
        s_stay()

        @step('객실1: 사진 2장 업로드 + 가격 + 추가금(필수/선택/미확인) + 시설 + 분위기 → 저장하고 다음 객실')
        def s_room1():
            page.get_by_label('객실명').fill('돔 A동')
            page.get_by_label('기준 인원').fill('2')
            page.get_by_label('최대 인원').fill('4')
            page.get_by_label('기본 숙박비').fill('250000')
            expect(page.get_by_label('기본 숙박비')).to_have_value('250,000')
            page.get_by_role('radio', name='예약 가능').click()
            page.get_by_label('바비큐 기본 금액').fill('30000')
            page.get_by_role('button', name='항목 추가').click()
            page.get_by_label('추가 비용 항목명').fill('인원 추가')
            page.get_by_label('인원 추가 기본 금액').fill('20000')
            page.get_by_role('radiogroup', name='인원 추가 필수 여부').get_by_role('radio', name='필수').click()
            # 음수 입력 차단
            page.get_by_label('불멍 기본 금액').fill('-1')
            expect(page.get_by_text('0 이상의 숫자만 입력할 수 있어').first).to_be_visible()
            page.get_by_label('불멍 기본 금액').fill('')
            # 총비용 미리보기: 기본 + 필수(인원추가) + 바비큐(선택됨) / 불멍(미확인)은 선택 해제
            calc = page.locator('text=총비용 미리보기').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
            calc.get_by_role('checkbox', name=re.compile('불멍')).uncheck()
            expect(calc).to_contain_text('₩300,000')
            page.locator('input[type=file]').set_input_files([f'{IMG}/tent1.jpg', f'{IMG}/tent2.jpg'])
            toast(page, '사진 2장을 업로드했어')
            expect(page.get_by_text('대표', exact=True)).to_be_visible()
            page.get_by_role('button', name=re.compile('^시설')).click()
            page.get_by_role('group', name='개별 화장실').get_by_text('있음').click()
            page.get_by_role('group', name='스파').get_by_text('없음').click()
            page.get_by_role('button', name=re.compile('^분위기')).click()
            page.get_by_label('인테리어').fill('우드톤, 전구 장식')
            shot(page, '02_room_form_desktop')
            page.get_by_role('button', name='저장하고 다음 객실').click()
            toast(page, '"돔 A동" 객실을 등록했어')
            expect(page.get_by_role('heading', name=re.compile('객실 추가'))).to_be_visible()
            expect(page.get_by_label('객실명')).to_have_value('')
        s_room1()

        @step('객실2 등록 (같은 숙소에 여러 객실)')
        def s_room2():
            page.get_by_label('객실명').fill('카라반 B')
            page.get_by_label('기본 숙박비').fill('180000')
            page.get_by_label('바비큐 기본 금액').fill('25000')
            page.get_by_role('button', name='저장', exact=True).click()
            toast(page, '"카라반 B" 객실을 등록했어')
            page.get_by_role('link', name='별빛 글램핑').first.click()
            expect(page.get_by_role('heading', name=re.compile('객실'))).to_contain_text('2')
        s_room2()

        @step('두 번째 숙소 + 가격 미입력 객실')
        def s_stay2():
            page.goto(BASE + '/stays/new')
            page.get_by_label('숙소명').fill('숲속 캠핑장')
            page.get_by_label('지역').fill('홍천')
            page.get_by_role('button', name='등록하고 객실 추가').click()
            page.get_by_label('객실명').fill('숲 텐트')
            page.get_by_role('button', name='저장', exact=True).click()
            toast(page, '객실을 등록했어')
        s_stay2()

        @step('홈: 카드/최저가/가격 미입력, 검색, 지역 필터, 가격순 정렬, 결과 없음')
        def s_home():
            page.goto(BASE)
            cards = page.locator('article')
            expect(cards).to_have_count(2)
            expect(cards.filter(has_text='별빛 글램핑')).to_contain_text('₩180,000~')
            expect(cards.filter(has_text='숲속 캠핑장')).to_contain_text('가격 미입력')
            page.get_by_label('정렬').select_option('priceDesc')
            expect(cards.first).to_contain_text('별빛 글램핑')  # 미입력은 항상 뒤
            page.get_by_label('지역 필터').select_option('홍천')
            expect(cards).to_have_count(1)
            page.get_by_label('지역 필터').select_option('')
            page.get_by_placeholder('숙소명 검색').fill('없는숙소')
            expect(page.get_by_text('조건에 맞는 숙소가 없어')).to_be_visible()
            page.get_by_role('button', name='필터 초기화').click()
            expect(cards).to_have_count(2)
            shot(page, '03_home_cards')
        s_home()

        @step('찜하기 → 찜만 보기 → 찜 페이지 메모·순위')
        def s_fav():
            page.get_by_role('button', name='돔 A동 찜하기').click()
            toast(page, '찜했어')
            page.get_by_role('button', name='숲 텐트 찜하기').click()
            page.get_by_role('button', name='찜한 객실만').click()
            expect(page.locator('article').filter(has_text='카라반 B')).to_have_count(0)
            page.get_by_role('button', name='찜한 객실만').click()
            page.get_by_role('link', name=re.compile('^찜')).first.click()
            items = page.locator('ol > li')
            expect(items).to_have_count(2)
            expect(items.first).to_contain_text('돔 A동')
            page.get_by_role('button', name='숲 텐트 순위 올리기').click()
            expect(items.first).to_contain_text('숲 텐트')
            page.get_by_label('돔 A동 개인 메모').fill('뷰가 제일 좋아')
            page.get_by_label('돔 A동 개인 메모').blur()
            expect(page.get_by_text('메모 저장됨')).to_be_visible()
        s_fav()

        @step('비교 3개: 4번째 차단, 바비큐 선택 시 총비용 변경, 최저가 표시, 미입력 객실 제외')
        def s_compare():
            page.goto(BASE)
            for name in ['돔 A동', '카라반 B', '숲 텐트']:
                page.get_by_role('button', name=f'{name} 비교에 담기').click()
                toast(page, '비교 목록에 추가했어')
            page.get_by_role('link', name=re.compile('^비교')).first.click()
            table = page.locator('table')
            total_row = table.locator('tr', has=page.get_by_role('rowheader', name=re.compile('예상 총비용')))
            # 바비큐 미포함: A = 250,000 + 필수 20,000, B = 180,000
            expect(total_row).to_contain_text('₩270,000')
            expect(total_row).to_contain_text('₩180,000')
            expect(total_row).to_contain_text('계산할 수 없어')
            expect(total_row.get_by_text('가장 저렴')).to_have_count(1)
            page.get_by_role('button', name='바비큐 포함').click()
            expect(total_row).to_contain_text('₩300,000')
            expect(total_row).to_contain_text('₩205,000')
            page.get_by_role('button', name='불멍 포함').click()
            expect(total_row).to_contain_text('가격 미확인')  # 불멍 금액이 없으면 확정 금액 아님
            expect(total_row.get_by_text('가장 저렴')).to_have_count(0)
            page.get_by_role('button', name='불멍 포함').click()
            # 시설: 미입력은 '확인 필요' (없음으로 표시하지 않음)
            toilet = table.locator('tr', has=page.get_by_role('rowheader', name=re.compile('^화장실')))
            expect(toilet).to_contain_text('있음')
            expect(toilet).to_contain_text('확인 필요')
            expect(toilet).to_contain_text('차이')
            # 장단점 작성
            page.get_by_label('돔 A동 장점').fill('전망 최고')
            page.get_by_label('돔 A동 장점').blur()
            expect(page.get_by_text('저장됨 · 두 사람이 함께 봐')).to_be_visible()
            shot(page, '04_compare_desktop')
            # 4번째 차단
            page.goto(BASE + '/stays')
            page.goto(BASE)
            page.get_by_role('link', name='숙소 등록').first.click()
            page.get_by_label('숙소명').fill('네번째 숙소')
            page.get_by_role('button', name='등록하고 객실 추가').click()
            page.get_by_label('객실명').fill('네번째 객실')
            page.get_by_role('button', name='저장', exact=True).click()
            page.get_by_role('button', name='비교 담기').click()
            toast(page, '최대 3개')
        s_compare()

        @step('비교 대상 변경 / 제거')
        def s_compare_change():
            page.get_by_role('link', name=re.compile('^비교')).first.click()
            page.get_by_label('숲 텐트 대신 비교할 객실').select_option(label='네번째 객실')
            expect(page.locator('table thead').get_by_role('link', name='네번째 객실')).to_have_count(1)
            page.get_by_role('button', name='네번째 객실 비교에서 제거').click()
            expect(page.locator('table thead').get_by_role('link', name='네번째 객실')).to_have_count(0)
            expect(page.locator('table thead')).to_contain_text('비교할 객실 추가 (2/3)')
        s_compare_change()

        @step('평가 입력/수정 → 평균·일부 평가 표시')
        def s_rating():
            page.goto(BASE)
            page.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='돔 A동').click()
            page.get_by_role('radiogroup', name='가격 및 가성비').get_by_role('radio', name='4점').click()
            page.get_by_role('radiogroup', name='분위기 및 감성').get_by_role('radio', name='5점').click()
            expect(page.get_by_text('일부 항목만 평가됨')).to_be_visible()
            page.get_by_role('radiogroup', name='가격 및 가성비').get_by_role('radio', name='3점').click()
            expect(page.locator('section').filter(has_text='내 평가').first).to_contain_text('4.0')
            shot(page, '05_room_detail')
        s_rating()

        @step('여행 날짜 변경 → 다른 날짜 가격 자동 적용 안 됨 → 복귀')
        def s_trip():
            page.get_by_role('button', name=re.compile('여행 날짜')).first.click()
            dlg = page.locator('dialog[open]')
            dlg.get_by_label('체크인').fill('2026-12-25')
            dlg.get_by_label('체크아웃').fill('2026-12-26')
            dlg.get_by_role('button', name='변경').click()
            toast(page, '여행 날짜를 변경했어')
            expect(page.get_by_text('이 날짜의 가격 정보가 없어 계산할 수 없어')).to_be_visible()
            page.goto(BASE)
            expect(page.locator('article').filter(has_text='별빛 글램핑')).to_contain_text('가격 미입력')
            page.get_by_role('button', name=re.compile('여행 날짜')).first.click()
            dlg = page.locator('dialog[open]')
            dlg.get_by_label('체크인').fill('2026-12-24')
            dlg.get_by_label('체크아웃').fill('2026-12-25')
            dlg.get_by_role('button', name='변경').click()
            expect(page.locator('article').filter(has_text='별빛 글램핑')).to_contain_text('₩180,000~')
        s_trip()

        @step('새 날짜 가격 입력 + 다른 날짜 복사(예약 여부는 확인 전으로 초기화)')
        def s_copy():
            page.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='돔 A동').click()
            page.get_by_role('link', name='수정').click()
            page.get_by_role('button', name='다른 날짜').click()
            page.locator('input[type=date]').nth(0).fill('2026-12-31')
            page.locator('input[type=date]').nth(1).fill('2027-01-01')
            page.get_by_role('button', name='추가', exact=True).click()
            expect(page.get_by_text('이 날짜의 가격 정보가 아직 없어')).to_be_visible()
            page.get_by_label('다른 날짜 가격 복사').select_option(index=1)
            expect(page.get_by_label('기본 숙박비')).to_have_value('250,000')
            expect(page.get_by_role('radio', name='확인 전')).to_have_attribute('aria-checked', 'true')
            page.get_by_label('기본 숙박비').fill('320000')
            page.get_by_role('button', name='저장', exact=True).click()
            toast(page, '객실 정보를 저장했어')
            expect(page.locator('table')).to_contain_text('₩320,000')
            expect(page.locator('table')).to_contain_text('₩250,000')
        s_copy()

        @step('새로고침 후 데이터 유지')
        def s_reload():
            page.reload()
            expect(page.get_by_role('heading', name='돔 A동')).to_be_visible()
            page.goto(BASE)
            expect(page.locator('article')).to_have_count(3)
            expect(page.get_by_role('link', name=re.compile('찜한 객실'))).to_contain_text('2')
        s_reload()

        @step('입력 중 이탈 방지 확인창')
        def s_guard():
            page.goto(BASE + '/stays/new')
            page.get_by_label('숙소명').fill('작성 중')
            page.get_by_role('link', name=re.compile('^찜')).first.click()
            expect(page.get_by_text('저장하지 않은 내용이 있어')).to_be_visible()
            page.get_by_role('button', name='계속 입력하기').click()
            expect(page.get_by_label('숙소명')).to_have_value('작성 중')
            page.get_by_role('link', name=re.compile('^찜')).first.click()
            page.get_by_role('button', name='나가기').click()
            expect(page).to_have_url(re.compile('/favorites'))
        s_guard()

        # ── 두 번째 사용자 ──
        ctx_b = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR')
        pb = ctx_b.new_page()

        @step('사용자 B: 같은 숙소 목록 공유, A 의 찜/비교는 안 보임, A 평가는 보임')
        def s_userb():
            login(pb, 'b@test.local')
            expect(pb.locator('article')).to_have_count(3)
            expect(pb.get_by_role('link', name=re.compile('찜한 객실'))).to_contain_text('0')
            pb.goto(BASE + '/compare')
            expect(pb.get_by_text('비교할 객실을 담아 줘')).to_be_visible()
            pb.goto(BASE)
            pb.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='돔 A동').click()
            expect(pb.get_by_text('정연의 평가')).to_be_visible()
            expect(pb.locator('div').filter(has_text=re.compile('^정연의 평가')).first).to_contain_text('4.0')
        s_userb()

        @step('동시 수정 충돌 감지 → 덮어쓰기 선택 시 저장')
        def s_conflict():
            # A 가 수정 화면을 열어둔 상태에서 B 가 먼저 저장
            page.goto(BASE)
            page.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='카라반 B').click()
            page.get_by_role('link', name='수정').click()
            pb.goto(BASE)
            pb.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='카라반 B').click()
            pb.get_by_role('link', name='수정').click()
            pb.get_by_label('침대 형태').fill('더블 1 (B 수정)')
            pb.get_by_role('button', name='저장', exact=True).click()
            expect(pb.get_by_text('객실 정보를 저장했어')).to_be_visible()
            page.get_by_label('객실 크기').fill('8평 (A 수정)')
            page.get_by_role('button', name='저장', exact=True).click()
            expect(page.get_by_text('다른 사람이 먼저 수정했어')).to_be_visible()
            expect(page.get_by_label('객실 크기')).to_have_value('8평 (A 수정)')
            page.get_by_role('button', name='내 입력으로 덮어쓰기').click()
            toast(page, '객실 정보를 저장했어')
            expect(page.get_by_text('8평 (A 수정)')).to_be_visible()
        s_conflict()

        @step('B 에서 바뀐 내용이 A 새로고침 버튼으로 반영')
        def s_sync():
            pb.goto(BASE + '/stays/new')
            pb.get_by_label('숙소명').fill('B가 등록한 숙소')
            pb.get_by_role('button', name='등록하고 객실 추가').click()
            expect(pb).to_have_url(re.compile('/rooms/new'))
            page.goto(BASE)
            page.get_by_role('button', name=re.compile('새로 불러오기')).click()
            expect(page.locator('article').filter(has_text='B가 등록한 숙소')).to_have_count(1)
        s_sync()

        @step('객실 삭제 → 찜·비교에서 정리')
        def s_delete_room():
            page.locator('article').filter(has_text='숲속 캠핑장').get_by_role('link', name='숲 텐트').click()
            page.get_by_role('button', name='객실 삭제').click()
            page.locator('dialog[open]').get_by_role('button', name='삭제').click()
            toast(page, '객실을 삭제했어')
            page.goto(BASE + '/favorites')
            expect(page.locator('ol > li')).to_have_count(1)
        s_delete_room()

        @step('숙소 삭제 확인창(영향 범위 표시) → 삭제')
        def s_delete_stay():
            page.goto(BASE)
            page.locator('article').filter(has_text='네번째 숙소').get_by_role('link', name='숙소 상세 보기', exact=True).click()
            page.get_by_role('button', name='숙소 삭제').click()
            dlg = page.locator('dialog[open]')
            expect(dlg).to_contain_text('객실 1개')
            dlg.get_by_role('button', name='취소').click()
            page.get_by_role('button', name='숙소 삭제').click()
            page.locator('dialog[open]').get_by_role('button', name='삭제').click()
            toast(page, '삭제했어')
            expect(page.locator('article').filter(has_text='네번째 숙소')).to_have_count(0)
        s_delete_stay()

        @step('JSON 백업(사진 포함) → 데이터 변경 → 복원으로 되돌림')
        def s_backup():
            page.goto(BASE + '/data')
            with page.expect_download() as dl:
                page.get_by_role('button', name='백업 파일 내려받기').click()
            path = f'{SHOTS}/backup.json'
            dl.value.save_as(path)
            data = json.load(open(path))
            assert data['app'] == 'christmas-stay' and len(data['images']) >= 3, 'backup should embed photos'
            assert len(data['data']['stays']) == 3
            # 잘못된 파일
            bad = f'{SHOTS}/bad.json'
            open(bad, 'w').write('{"hello": 1}')
            page.locator('input[type=file]').set_input_files(bad)
            toast(page, '가져올 수 없어')
            # 데이터를 바꾼 뒤 복원
            page.goto(BASE)
            page.locator('article').filter(has_text='B가 등록한 숙소').get_by_role('link', name='숙소 상세 보기', exact=True).click()
            page.get_by_role('button', name='숙소 삭제').click()
            page.locator('dialog[open]').get_by_role('button', name='삭제').click()
            expect(page.locator('article')).to_have_count(2)
            page.goto(BASE + '/data')
            page.locator('input[type=file]').set_input_files(path)
            dlg = page.locator('dialog[open]')
            expect(dlg).to_contain_text('숙소 3개')
            dlg.get_by_role('button', name='덮어쓰고 가져오기').click()
            toast(page, '숙소 3개')
            page.goto(BASE)
            expect(page.locator('article')).to_have_count(3)
            expect(page.locator('article').filter(has_text='별빛 글램핑')).to_contain_text('₩180,000~')
            page.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='돔 A동').click()
            expect(page.get_by_role('img', name=re.compile('돔 A동 사진 1'))).to_be_visible()
            expect(page.get_by_text('전망 최고')).to_have_count(0)  # 장단점은 비교 화면에서
            page.goto(BASE + '/favorites')
            expect(page.locator('ol > li')).to_have_count(1)
        s_backup()

        # ── 모바일 ──
        ctx_m = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ko-KR')
        pm = ctx_m.new_page()
        pm.on('pageerror', lambda e: console_errors.append(f'mobile pageerror: {e}'))

        @step('모바일: 홈 / 객실 폼 / 비교표 가로 스크롤 / 하단 내비')
        def s_mobile():
            login(pm, 'a@test.local')
            expect(pm.locator('article').first).to_be_visible()
            overflow = pm.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            assert overflow <= 1, f'page has horizontal overflow {overflow}px'
            shot(pm, '06_mobile_home')
            pm.get_by_role('navigation', name='주요 메뉴').last.get_by_role('link', name=re.compile('비교')).click()
            pm.goto(BASE + '/compare')
            if pm.get_by_text('비교할 객실을 담아 줘').count():
                pm.goto(BASE)
                for name in ['돔 A동', '카라반 B']:
                    pm.get_by_role('button', name=f'{name} 비교에 담기').click()
                pm.goto(BASE + '/compare')
            wrap = pm.locator('table').locator('xpath=..')
            sw = wrap.evaluate('e => e.scrollWidth - e.clientWidth')
            assert sw > 0, 'compare table should scroll horizontally'
            overflow = pm.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            assert overflow <= 1, f'compare page overflows {overflow}px'
            shot(pm, '07_mobile_compare')
            pm.goto(BASE)
            pm.locator('article').first.get_by_role('link', name='숙소 상세 보기', exact=True).click()
            pm.get_by_role('link', name='객실 추가').first.click()
            overflow = pm.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            assert overflow <= 1, f'room form overflows {overflow}px'
            shot(pm, '08_mobile_room_form')
            # 갤러리 스와이프
            pm.goto(BASE)
            pm.locator('article').filter(has_text='별빛 글램핑').get_by_role('link', name='돔 A동').click()
            g = pm.get_by_role('region', name=re.compile('사진 2장')).first
            expect(g).to_contain_text('1 / 2')
            g.get_by_role('button', name='다음 사진').click()
            expect(g).to_contain_text('2 / 2')
            g.get_by_role('button', name='다음 사진').click()
            expect(g).to_contain_text('1 / 2')
            shot(pm, '09_mobile_room_detail')
        s_mobile()

        @step('비멤버 계정 차단 화면')
        def s_outsider():
            ctx_x = browser.new_context()
            px = ctx_x.new_page()
            login(px, 'x@test.local')
            expect(px.get_by_text('멤버로 등록되지 않은 계정이야')).to_be_visible()
            ctx_x.close()
        s_outsider()

        browser.close()


if __name__ == '__main__':
    print('E2E 시작')
    try:
        main()
    except Exception:
        pass
    print('\n결과')
    for r in results:
        print(' ', *r)
    errs = [e for e in console_errors if 'favicon' not in e and 'ERR_' not in e]
    print(f'\n콘솔 오류 {len(errs)}건')
    for e in errs[:15]:
        print('  -', e[:200])
    sys.exit(0 if results and all(r[0] == 'PASS' for r in results) else 1)
