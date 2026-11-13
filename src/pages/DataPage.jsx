import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudUpload, Download, FileJson, Info, Link2, LogOut, Users } from 'lucide-react'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import { useToast } from '../components/common/Toast.jsx'
import { useStore } from '../store/AppStore.jsx'
import { buildBackup, downloadJson, parseBackupFile, runImport } from '../services/backup.js'
import { clearLegacyData, hasLegacyData, loadLegacyData } from '../services/legacyLocal.js'
import { useSession } from '../store/session.js'

export default function DataPage() {
  const { state, actions } = useStore()
  const { signOut } = useSession()
  const toast = useToast()
  const fileRef = useRef(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [pending, setPending] = useState(null) // { source, data, images, warnings, missingImages }
  const [progress, setProgress] = useState(null)
  const [legacy, setLegacy] = useState(() => hasLegacyData())
  const partner = state.members.find((m) => m.id !== state.me.id)

  async function exportJson() {
    setExporting(true)
    try {
      const { payload, failed } = await buildBackup(state, { includePhotos })
      downloadJson(payload)
      toast.success(failed ? `백업 파일을 저장했어 (사진 ${failed}장은 포함하지 못함)` : '백업 파일을 저장했어')
    } catch (err) {
      toast.error(`백업 실패: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  async function pickFile(file) {
    if (!file) return
    const res = await parseBackupFile(file)
    if (res.errors?.length) {
      toast.error(`가져올 수 없어: ${res.errors.slice(0, 2).join(' / ')}`)
      return
    }
    setPending({ source: 'file', ...res })
  }

  async function pickLegacy() {
    const res = await loadLegacyData()
    if (!res.data) {
      toast.error(res.errors?.[0] || '이전 데이터를 읽을 수 없어')
      return
    }
    setPending({ source: 'legacy', ...res })
  }

  async function confirmImport() {
    const p = pending
    setProgress('준비 중')
    try {
      const res = await runImport({ data: p.data, images: p.images }, setProgress)
      await actions.refresh({ silent: true })
      if (p.source === 'legacy') {
        clearLegacyData()
        setLegacy(false)
      }
      toast.success(`숙소 ${res.stays}개 · 객실 ${res.rooms}개를 가져왔어${res.droppedPhotos ? ` (사진 ${res.droppedPhotos}장 제외)` : ''}`)
      setPending(null)
    } catch (err) {
      toast.error(`가져오기 실패: ${err.message}. 기존 데이터는 그대로야.`)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-serif text-2xl font-bold md:text-3xl">데이터 관리</h1>

      <section className="card p-6">
        <h2 className="section-title flex items-center gap-2"><Users className="size-5 text-gold" aria-hidden /> 함께 쓰는 사람</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li><b>{state.me.displayName}</b> <span className="text-muted">(나)</span></li>
          <li>{partner ? <b>{partner.displayName}</b> : <span className="text-muted">아직 다른 멤버가 없어</span>}</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          숙소·객실·가격·장단점·여행 날짜는 두 사람이 함께 보고 수정해. 찜·메모·순위·비교 목록은 각자 따로 저장되고, 평가는 서로 볼 수 있어.
          실시간 동시 편집은 아니야. 다른 기기에서 바꾼 내용은 이 창으로 돌아오거나 새로고침 버튼을 누르면 반영돼.
        </p>
        <button className="btn-outline mt-4" onClick={signOut}>
          <LogOut className="size-4" aria-hidden /> 로그아웃
        </button>
      </section>

      <section className="card p-6">
        <h2 className="section-title flex items-center gap-2"><Download className="size-5 text-gold" aria-hidden /> JSON 백업</h2>
        <p className="mt-2 text-sm text-muted">공동 데이터 전체와 내 찜·평가·비교 목록을 파일로 저장해.</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-burgundy" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
          <span>
            업로드한 사진 파일도 포함
            <span className="block text-xs text-muted">
              끄면 파일이 작아지지만, 업로드 사진은 같은 Supabase 프로젝트에서만 복원돼. URL로 넣은 사진은 항상 포함돼.
            </span>
          </span>
        </label>
        <button className="btn-pine mt-4" onClick={exportJson} disabled={exporting}>
          <FileJson className="size-4" aria-hidden /> {exporting ? '만드는 중…' : '백업 파일 내려받기'}
        </button>
      </section>

      <section className="card p-6">
        <h2 className="section-title flex items-center gap-2"><CloudUpload className="size-5 text-gold" aria-hidden /> 복원 · 이전</h2>
        <p className="mt-2 text-sm text-muted">백업 파일로 복원하면 현재 공동 데이터와 두 사람의 찜·평가·비교 목록이 모두 백업 내용으로 바뀌어.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => fileRef.current?.click()}>
            <FileJson className="size-4" aria-hidden /> JSON 파일 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {legacy && (
            <button className="btn-primary" onClick={pickLegacy}>
              <CloudUpload className="size-4" aria-hidden /> 이 브라우저에 저장된 이전 데이터 옮기기
            </button>
          )}
        </div>
        {!legacy && <p className="mt-3 text-xs text-muted">이 브라우저에는 이전 버전(localStorage) 데이터가 없어.</p>}
      </section>

      <section className="card p-6">
        <h2 className="section-title flex items-center gap-2"><Link2 className="size-5 text-gold" aria-hidden /> 예약 링크 일괄 업데이트</h2>
        <p className="mt-2 text-sm text-muted">숙소 이름과 예약 링크가 담긴 JSON 으로, 이미 등록된 숙소의 예약 링크만 한 번에 바꿔. 다른 정보는 그대로야.</p>
        <Link to="/stays/booking-links" className="btn-outline mt-4">
          <Link2 className="size-4" aria-hidden /> 예약 링크 업데이트하기
        </Link>
      </section>

      <section className="rounded-3xl border border-line p-5 text-xs leading-relaxed text-muted">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Supabase 무료 플랜 기준: DB 500MB, 사진 저장 1GB, 월 전송량 5GB. 7일 동안 아무도 접속하지 않으면 프로젝트가 일시정지되니, 여행 준비 기간에는 가끔 열어 줘.
          (정지되면 Supabase 대시보드에서 다시 켤 수 있어)
        </p>
      </section>

      <ConfirmDialog
        open={!!pending}
        tone="danger"
        title="데이터를 덮어쓸까?"
        busy={!!progress}
        confirmLabel={progress || '덮어쓰고 가져오기'}
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
        description={
          pending && (
            <>
              <p>
                {pending.source === 'legacy' ? '이 브라우저의 이전 데이터' : '백업 파일'}: 숙소 <b>{pending.data.stays.length}</b>개 · 객실{' '}
                <b>{pending.data.rooms.length}</b>개
              </p>
              <p className="mt-2">
                현재 저장된 숙소 {state.stays.length}개와 두 사람의 찜·평가·비교 목록은 <b>모두 지워지고</b> 이 내용으로 바뀌어. 먼저 백업해 두는 걸 추천해.
              </p>
              {pending.missingImages > 0 && <p className="mt-2 text-burgundy">사진 {pending.missingImages}장은 파일이 없어 제외돼.</p>}
              {pending.warnings?.length > 0 && <p className="mt-2 text-xs">참고: {pending.warnings.slice(0, 3).join(' / ')}</p>}
            </>
          )
        }
      />
    </div>
  )
}
