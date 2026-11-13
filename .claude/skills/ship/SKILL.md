---
name: ship
description: 작업을 마무리하고 커밋·푸시 준비. verify 실행 후 커밋 메시지와 git 명령어를 만든다. 사용자가 /ship 으로 직접 호출할 때만 사용.
disable-model-invocation: true
---

# ship — 커밋 · 배포 준비

1. `verify` 스킬 절차를 먼저 실행해. 실패가 있으면 여기서 멈추고 보고해.
2. `git status` 로 커밋 대상 확인.
   - `.env`, `.env.local`, `.mock-storage/`, `dist/` 가 포함되면 멈추고 알려줘.
3. 변경 내용을 요약해서 한국어 커밋 메시지를 만들어. 형식:
   ```
   <type>: <한 줄 요약>

   - 변경 1
   - 변경 2
   ```
   type: feat / fix / refactor / style / docs / chore / db
4. 사용자에게 아래를 보여주고 **승인받은 뒤** 실행해:
   ```bash
   git add <파일들>
   git commit -m "..."
   git push
   ```
5. DB 마이그레이션이 포함됐다면 push 전에 반드시 알려줘:
   > ⚠️ `supabase/migrations/<파일>.sql` 을 Supabase SQL Editor 에서 먼저 실행해야 해. 순서: SQL 실행 → push(→ Vercel 자동 배포).
6. push 후 Vercel 이 자동 배포한다는 것과, 배포 후 확인할 화면 2~3개를 체크리스트로 알려줘.
