# Christmas Stay 설정 가이드 (직접 해야 하는 작업)

순서대로 따라 하면 돼. ✅ 표시는 **네가 직접** 해야 하는 작업이야. 코드는 이미 다 들어 있어.

> 대시보드 메뉴 이름은 Supabase / Vercel 이 화면을 바꾸면 조금 다를 수 있어. 이름이 다르면 비슷한 메뉴를 찾아 줘.

---

## 0. 준비물

- ✅ [Node.js](https://nodejs.org) **LTS (20 이상)** 설치 → 터미널에서 `node -v` 로 확인
- ✅ [VS Code](https://code.visualstudio.com) 설치
- ✅ 계정: [Supabase](https://supabase.com), [Vercel](https://vercel.com), [GitHub](https://github.com) (모두 무료 플랜)

## 1. VS Code 로 프로젝트 열기

1. ✅ zip 을 풀고 VS Code → **File > Open Folder** → `christmas-stay` 폴더 선택
2. ✅ 오른쪽 아래 “권장 확장 설치” 알림 → **Install All** (Tailwind 자동완성, Supabase, Claude Code 등)
3. ✅ **Terminal > Run Task… > `1. 패키지 설치 (npm install)`** (또는 터미널에서 `npm install`)

## 2. Supabase 프로젝트 만들기

1. ✅ supabase.com 로그인 → **New project**
   - Name: `christmas-stay`
   - Database Password: 자동 생성 후 **따로 저장** (앱에서는 쓰지 않지만 나중에 필요할 수 있어)
   - Region: **Northeast Asia (Seoul)**
   - Plan: Free
2. 생성 완료까지 1~2분 기다리기

## 3. DB 테이블·보안 정책 만들기 (SQL 실행)

`supabase/migrations/` 의 파일을 **파일 이름(날짜) 순서대로** 하나씩 실행해. 이미 실행한 파일을 다시 실행해도 데이터는 지워지지 않아.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `20261113000000_init.sql` | 테이블·RLS·Storage·RPC 전체 |
| 2 | `20261114000000_stay_type.sql` | 숙소 유형(글램핑·풀빌라·카라반 …) 칸 추가 |

1. ✅ 왼쪽 메뉴 **SQL Editor** → **New query**
2. ✅ 위 표의 파일 내용을 **전부** 복사해서 붙여넣기 → **Run** (파일마다 반복)
3. “Success” 가 나오면 완료. 확인:
   - **Table Editor** 에 `stays`, `rooms`, `room_rates`, `favorites`, `ratings` … 테이블이 보임
   - **Storage** 에 `stay-photos` 버킷이 보임

> ⚠️ `supabase/tests/` 폴더의 SQL 은 **로컬 테스트 전용**이야. 실제 Supabase 에서는 실행하지 마.
> 실제 숙소 데이터는 하나도 들어가지 않아. 공동 여행 날짜 기본값(12/25~12/26)만 들어가.

## 4. 로그인 계정 2개 만들고 멤버로 등록

### 4-1. 아무나 가입하지 못하게 막기
✅ **Authentication > Sign In / Providers**(또는 Authentication > Settings) → **Allow new users to sign up** 끄기 → Save

### 4-2. 두 사람 계정 만들기
✅ **Authentication > Users > Add user > Create new user**
- 이메일 / 비밀번호 입력, **Auto Confirm User** 체크 → Create
- 짝꿍 계정도 똑같이 하나 더

### 4-3. 멤버 등록 (이걸 해야 데이터에 접근할 수 있어)
✅ **SQL Editor** 에서 이메일과 표시 이름만 바꿔서 실행:

```sql
insert into public.members (user_id, display_name)
select id, '정연' from auth.users where email = '내이메일@example.com';

insert into public.members (user_id, display_name)
select id, '짝꿍' from auth.users where email = '짝꿍이메일@example.com';

select * from public.members;  -- 2줄 나오면 성공
```

> 멤버는 최대 2명까지만 등록돼 (DB 에서 막아 둠). 회원가입이 실수로 열려 있어도 멤버가 아니면 아무 데이터도 볼 수 없어.

## 5. 환경변수 (.env.local)

1. ✅ Supabase **Project Settings > API Keys** 에서 복사
   - **Project URL** (예: `https://abcd1234.supabase.co`) — Project Settings > Data API 또는 프로젝트 홈에 있음
   - **Publishable key** (`sb_publishable_...`). 예전 프로젝트라면 **anon public** 키
2. ✅ 프로젝트 폴더의 `.env.example` 을 복사해서 이름을 `.env.local` 로 바꾸고 채우기:

```env
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

> 🔒 **secret 키 / service_role 키는 절대 넣지 마.** `VITE_` 로 시작하는 값은 브라우저에 그대로 공개돼.
> 이 앱은 secret 키가 전혀 필요 없어. 혹시 넣으면 앱이 감지해서 실행을 멈추고 경고를 띄워.
> `.env.local` 은 `.gitignore` 에 들어 있어서 GitHub 에 올라가지 않아.

## 6. 내 PC 에서 실행

✅ **F5** (크롬이 열리면서 개발 서버 실행) 또는 **Terminal > Run Task… > `2. 개발 서버 실행`** → http://localhost:5173

4단계에서 만든 계정으로 로그인 → “아직 등록된 숙소가 없어!” 화면이 나오면 성공.

## 7. GitHub 에 올리기

✅ VS Code 터미널에서 (GitHub 에서 빈 저장소 `christmas-stay` 를 먼저 만들어 둬):

```bash
git init
git add .
git commit -m "Christmas Stay 초기 버전 (React + Supabase)"
git branch -M main
git remote add origin https://github.com/<내아이디>/christmas-stay.git
git push -u origin main
```

`git status` 를 했을 때 `.env.local` 이 목록에 **없어야** 정상이야.

## 8. Vercel 배포

1. ✅ vercel.com → **Add New… > Project** → GitHub 의 `christmas-stay` 선택 → Import
2. Framework Preset 이 **Vite** 로 자동 선택되는지 확인 (Build: `npm run build`, Output: `dist`)
3. ✅ **Environment Variables** 에 5단계의 두 값 추가
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. ✅ **Deploy** → 발급된 주소(예: `christmas-stay.vercel.app`)로 접속해서 로그인
5. ✅ Supabase **Authentication > URL Configuration > Site URL** 을 Vercel 주소로 바꾸기
   (비밀번호 로그인에는 영향 없지만, 나중에 비밀번호 재설정 메일 등이 올바른 주소로 가게 하려면 필요해)

> 환경변수를 바꾼 뒤에는 Vercel 에서 **Redeploy** 해야 반영돼.
> `vercel.json` 이 들어 있어서 상세 페이지에서 새로고침해도 404 가 나지 않아.
> 이후에는 `git push` 할 때마다 자동으로 다시 배포돼.

## 9. 이전 데이터 옮기기 (해당되는 경우만)

- 예전 localStorage 버전을 쓰던 **같은 브라우저**로 접속 → **데이터 > “이 브라우저에 저장된 이전 데이터 옮기기”** (이전 데이터가 있을 때만 버튼이 보여)
- 다른 기기의 데이터라면, 그 기기에서 JSON 백업 파일을 만든 뒤 **데이터 > JSON 파일 선택**
- 가져오기는 현재 Supabase 데이터를 **덮어써**. 확인창이 먼저 떠.

---

## 무료 플랜으로 운영할 때 알아둘 것

| 항목 | 무료 한도 | 이 앱에서 |
|---|---|---|
| DB | 500MB | 텍스트 데이터라 수천 개 숙소도 수 MB 수준 |
| 사진 저장 | 1GB | 업로드 시 1600px 로 줄여서 장당 약 0.2~0.5MB → 2,000장 이상 |
| 전송량 | 월 5GB | 두 사람이 쓰기엔 충분 |
| 일시정지 | **7일 동안 접속이 없으면 프로젝트 정지** | 정지되면 Supabase 대시보드에서 Restore. 데이터는 유지됨 |
| 백업 | 자동 백업 없음 | **데이터 > 백업 파일 내려받기** 를 가끔 해 둬 |

Edge Functions 는 쓰지 않아. 저장·검증 로직은 전부 DB 함수(RPC)와 RLS 정책으로 처리해서 무료 한도와 관계없어.

## 보안 체크리스트

- [ ] `.env.local` 과 Vercel 환경변수에 **publishable 키만** 들어 있음
- [ ] Authentication 에서 **회원가입 꺼짐**
- [ ] `members` 테이블에 두 사람만 등록됨
- [ ] 사진 버킷은 **공개 읽기** 버킷이야. 업로드·삭제는 멤버만 가능하지만, 사진 주소를 아는 사람은 볼 수 있어 (주소는 추측 불가능한 UUID). 숙소 사진이라 이 방식이 가장 단순해서 선택했어. 비공개가 필요하면 Claude Code 에 “stay-photos 버킷을 private 으로 바꾸고 signed URL 로 표시해 줘”라고 요청하면 돼.

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| “Supabase 연결 설정이 필요해” | `.env.local` 위치(프로젝트 최상위)와 변수 이름. 수정 후 개발 서버 재시작 |
| “멤버로 등록되지 않은 계정이야” | 4-3 단계 SQL 실행 여부, 이메일 오타 |
| “서버에 연결할 수 없어” | 인터넷 연결, Supabase 프로젝트 일시정지 여부 |
| 사진 업로드 권한 오류 | 3단계 SQL 을 끝까지 실행했는지 (Storage 정책 포함) |
| “다른 사람이 먼저 수정했어” | 정상 동작. 상대가 같은 숙소/객실을 먼저 저장한 경우. 덮어쓰기 또는 취소 선택 |
| Vercel 에서만 로그인 화면이 설정 오류 | Vercel 환경변수 입력 후 Redeploy 했는지 |
