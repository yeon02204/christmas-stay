---
name: ui-change
description: Christmas Stay 화면·컴포넌트를 새로 만들거나 디자인을 바꿀 때 사용. 디자인 토큰, 공통 컴포넌트, 모바일 규칙, 접근성, 화면 확인 절차를 담고 있다.
---

# ui-change — 화면 작업 가이드

## 디자인 방향
따뜻하고 로맨틱한 크리스마스 감성, 하지만 **입력·비교 사용성이 최우선**. 과한 장식·애니메이션 금지.
크림 배경, 버건디 포인트, 딥그린, 은은한 골드, 둥근 카드, 부드러운 그림자, 넉넉한 간격, 사진이 돋보이게.

## 토큰 (`src/index.css`)
| 용도 | 클래스 |
|---|---|
| 색 | `bg-cream` `bg-cream-deep` `text-ink` `text-muted` `border-line` `bg-burgundy` `bg-burgundy-soft` `text-pine` `bg-pine-soft` `text-gold` `bg-gold-soft` |
| 글꼴 | 제목 `font-serif`(Gowun Batang), 본문 기본(Pretendard), 숫자 `tabular-nums` |
| 카드 | `card` (rounded-3xl, white, shadow-soft) |
| 버튼 | `btn-primary` `btn-pine` `btn-outline` `btn-ghost` `btn-danger` + 작게 `btn-sm`, 아이콘 `icon-btn` |
| 입력 | `input`, 오류 `input-error`, 라벨 `field-label` |
| 기타 | `chip`, `section-title`, 미입력 표시 `muted-na` |
새 공통 스타일은 `@utility 이름 { ... }` 로 추가 (Tailwind 4 는 `@apply` 로 커스텀 클래스 참조 시 `@utility` 필요).

## 공통 컴포넌트 먼저 재사용
- 입력: `components/common/fields.jsx` → `TextInput`, `TextArea`, `PriceInput`(금액, null=미입력), `NumberInput`, `TriState`(시설), `RatingInput`, `FormSection`(접기), `NA`, `Spinner`
- `Photo`(플레이스홀더 포함), `ImagePicker`(URL/업로드/드래그/붙여넣기), `ImageGallery`
- `ConfirmDialog`(삭제·덮어쓰기 확인), `EmptyState`, `useToast()` 의 `success/error/info`
- 폼 이탈 방지: `useUnsavedGuard(dirty)` + `UnsavedDialog`
- 업로드 정리: `useUploadTracker()`

## 규칙
- 문구는 반말·친근한 톤. 미입력은 "미입력", 확인 안 된 사실은 "확인 필요", 금액 없음은 "가격 미확인".
- 금액 표시는 `formatWon()` (₩ + 천 단위 쉼표). null 을 0 으로 바꾸지 마.
- 모바일 우선: 390px 에서 가로 스크롤이 생기면 안 됨(비교표 내부 스크롤은 예외). 하단 내비(64px)·하단 고정 저장 바와 겹치지 않게.
- 터치 영역 최소 40px (`min-h-11`, `size-10`).
- 접근성: 아이콘 버튼 `aria-label`, 토글 `aria-pressed`, 라디오 그룹 `role="radiogroup"`, 입력엔 label.
- 애니메이션은 `animate-fade-up` 정도만. `prefers-reduced-motion` 은 이미 처리됨.

## 확인 절차
1. `npm run build`
2. Playwright MCP 가 있으면 `browser-qa` 스킬로 1280px / 390px 스크린샷을 찍어 직접 보고, 넘침·겹침·잘림을 고쳐.
3. 바뀐 화면과 확인한 크기를 보고에 적어.
