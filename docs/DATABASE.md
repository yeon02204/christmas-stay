# 데이터 구조 · API 명세

SQL 은 `supabase/migrations/` 에 날짜 순서로 있어: `20261113000000_init.sql`(전체 스키마) → `20261114000000_stay_type.sql`(숙소 유형).

## 1. 테이블

```
auth.users (Supabase 기본)
  └─ members (user_id PK, display_name)         ← 최대 2명, 여기 있는 계정만 접근 가능

[공동 데이터 — 두 멤버가 함께 조회·수정]
stays (숙소) ........................... stay_type: '' | glamping | poolvilla | caravan | camping | pension | hotel | mixed | other  ('' = 미분류)
  └─ rooms (객실) ............................ stay_id FK, on delete cascade
       ├─ room_images (사진, 순서) ........... url 또는 storage_path 중 하나만
       ├─ room_extras (추가금 항목) .......... kind: bbq | fire | custom, default_price(null=가격 미확인), required
       └─ room_rates (날짜 구간별) ........... unique(room_id, check_in, check_out)
            │                                  room_price(null=미입력), availability, checked_at
            └─ rate_extra_prices ............. 이 날짜에만 다른 추가금 (rate_id, extra_id)
trip_settings (공동 여행 일정, 단일 행)

[사용자별 데이터 — 본인 것만]
favorites (user_id, room_id, memo, priority)      ← priority 순서 = 최종 후보 순위
ratings   (user_id, room_id, price/location/facility/mood/terms 1~5, null=미평가)  ← 서로 조회는 가능
compare_items (user_id, room_id, position 0~2)   ← 최대 3개
user_settings (user_id, compare_bbq, compare_fire)
compare_extra_selections (user_id, extra_id)     ← 비교 화면에서 선택한 기타 추가금
```

### 주요 제약조건

| 대상 | 제약 |
|---|---|
| 금액 | `>= 0` 정수. 미입력은 `null` (0원으로 취급하지 않음) |
| URL | `http(s)://` 로 시작해야 함 (`javascript:` 등 차단) |
| 시설 | jsonb, 허용 키 14개 / 값 `yes·no·unknown` 만 |
| 인원 | 1~99, 최대 인원 ≥ 기준 인원 |
| 날짜 구간 | 체크아웃 > 체크인, 최대 30박 |
| 평가 | 1~5 또는 null |
| 바비큐·불멍 항목 | 객실당 하나씩만 |
| 날짜별 추가금 | 같은 객실의 추가금 항목만 연결 (트리거) |
| 멤버 | 최대 2명 (트리거) |
| 동시 수정 | `stays.version`, `rooms.version` 낙관적 잠금 → 충돌 시 `P0409` |

## 2. RLS (Row Level Security)

| 테이블 | 조회 | 생성·수정·삭제 |
|---|---|---|
| stays, rooms, room_images, room_extras, room_rates, rate_extra_prices | 멤버 | 멤버 |
| trip_settings | 멤버 | 멤버 (수정만) |
| members | 멤버 | 본인 표시 이름만 수정. 추가/삭제는 SQL Editor 에서만 |
| favorites, compare_items, user_settings, compare_extra_selections | **본인** | **본인** |
| ratings | 멤버 (서로 조회) | **본인** |
| storage `stay-photos` | 공개 URL 로 읽기 | 멤버만 업로드/삭제, 5MB, jpg/png/webp |

- `anon` 역할은 모든 테이블·함수 권한이 회수돼 있어.
- 숙소/객실 삭제 시 두 사람의 찜·평가·비교 기록은 FK cascade 로 함께 정리돼.

## 3. API (Supabase RPC)

프론트엔드는 `src/services/api.js` 에서 `supabase.rpc(이름, 인자)` 로만 호출해.
모든 함수는 `security invoker` 라서 호출한 사용자 권한(RLS)으로 실행되고, 여러 테이블 저장이 **하나의 트랜잭션**으로 묶여.

| 함수 | 인자 | 반환 | 설명 |
|---|---|---|---|
| `get_app_state` | – | AppState | 앱 초기 로딩용 전체 데이터 |
| `save_stay` | `p: Stay` | `{ stay, removedPaths }` | id 없으면 생성, 있으면 version 확인 후 수정 |
| `stay_delete_impact` | `p_stay_id` | `{ rooms, favorites, compares, ratings }` | 삭제 확인창용 (두 사람 합계) |
| `delete_stay` | `p_stay_id` | `{ removedPaths }` | 객실·가격·찜·평가·비교 cascade |
| `save_room` | `p: Room` | `{ room, extraIdMap, removedPaths }` | 기본정보+사진+추가금+시설+분위기+날짜별 가격 일괄 저장 |
| `delete_room` | `p_room_id` | `{ removedPaths }` | |
| `update_room_notes` | `p_room_id, p_pros, p_cons` | – | 비교 화면 장단점 (공유) |
| `set_favorite` | `p_room_id, p_on` | – | 내 찜 |
| `update_favorite_memo` | `p_room_id, p_memo` | – | |
| `reorder_favorites` | `p_room_ids uuid[]` | – | 최종 후보 순위 |
| `set_rating` | `p_room_id, p_criterion, p_score(null=미평가)` | – | 내 평가 |
| `set_compare` | `p_room_ids uuid[] (≤3)` | – | 내 비교 목록 |
| `set_compare_options` | `p_bbq, p_fire, p_extra_ids` | – | 비교 계산 조건 |
| `set_trip` | `p_check_in, p_check_out` | Trip | 공동 일정 |
| `import_backup` | `p: BackupData` | `{ stays, rooms, removedPaths }` | 전체 교체 복원 (localStorage 이전 포함) |

`removedPaths` 는 더 이상 쓰지 않는 Storage 사진 경로야. 클라이언트가 Storage 에서 지워 (`src/services/photos.js`).

### 오류 코드

| SQLSTATE | 의미 | 화면 처리 |
|---|---|---|
| `42501` | 멤버 아님 / 권한 없음 | 차단 화면 |
| `P0409` | 동시 수정 충돌 | “덮어쓸까?” 확인창 (입력 내용 유지) |
| `P0404` | 대상 없음 (삭제됨) | 토스트 |
| `22023` | 잘못된 인자 | 토스트 |
| `23514` | 제약조건 위반 (음수, 잘못된 URL 등) | 토스트 |

### 데이터 형태 (JSON)

```js
Room = {
  id, stayId, version, name, baseGuests, maxGuests, size, bedType, description,
  images: [{ type: 'url', url } | { type: 'storage', path }],
  extras: [{ id, kind: 'bbq'|'fire'|'custom', name, defaultPrice: number|null, required }],
  rates: {
    '2026-12-24_2026-12-25': {
      roomPrice: number|null,
      extraPrices: { [extraId]: number },      // 이 날짜에만 다른 추가금
      availability: 'unchecked'|'available'|'unavailable',
      checkedAt: 'YYYY-MM-DD' | ''
    }
  },
  facilities: { toilet: 'yes'|'no'|'unknown', ... },
  mood: { interior, view, privacy, christmas },
  checkIn, checkOut, bookingUrl, cancelPolicy, notes, pros, cons
}
```

## 4. 총비용 계산 규칙 (`src/utils/price.js`)

```
총비용 = 기본 숙박비 + 필수 추가금 + 사용자가 선택한 선택 추가금
```

- 추가금 금액 = 그 날짜의 금액 → 없으면 공통 기본값 → 둘 다 없으면 **가격 미확인**
- 기본 숙박비 미입력 → “계산할 수 없어”
- 해당 날짜 구간의 가격 정보가 없음 → 다른 날짜 가격을 **가져오지 않음**
- 포함된 추가금 중 가격 미확인이 있으면 → “₩X +α · 확정 금액 아님”
- “가장 저렴” 표시는 계산이 끝난 객실이 2개 이상일 때만

계산은 클라이언트에서 해 (DB 의 원본 금액을 그대로 읽어서 계산하므로 별도 서버 검증이 필요 없음).
금액 자체의 유효성(음수, 정수)은 DB 제약조건이 보장해.
