import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Home, ImageIcon, NotebookPen } from 'lucide-react'
import { Field, FormSection, TextArea, TextInput } from '../components/common/fields.jsx'
import ImagePicker from '../components/common/ImagePicker.jsx'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import UnsavedDialog from '../components/common/UnsavedDialog.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import { useToast } from '../components/common/Toast.jsx'
import DeleteStayButton from '../components/stay/DeleteStayButton.jsx'
import { useStore } from '../store/AppStore.jsx'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard.js'
import { isEqualJson, storagePaths, useUploadTracker } from '../hooks/useFormHelpers.js'
import { createEmptyStay, STAY_TYPES } from '../utils/models.js'
import { normalizeUrlInput, validateStay } from '../utils/validation.js'

export default function StayFormPage() {
  const { stayId } = useParams()
  const { state } = useStore()
  const existing = stayId ? state.stays.find((s) => s.id === stayId) : null
  if (stayId && !existing) {
    return (
      <EmptyState
        icon={Home}
        title="숙소를 찾을 수 없어"
        description="삭제되었거나 주소가 잘못됐어."
        action={<Link to="/" className="btn-primary">홈으로</Link>}
      />
    )
  }
  return <StayForm key={stayId || 'new'} initial={existing} />
}

function StayForm({ initial }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { state, actions } = useStore()
  const isNew = !initial
  const base = useMemo(() => initial || createEmptyStay(), [initial])
  const [form, setForm] = useState(base)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const uploads = useUploadTracker()
  const dirty = !isEqualJson(form, base)
  const { blocker, allowNext } = useUnsavedGuard(dirty && !saving)

  const set = (k) => (e) => {
    const v = typeof e === 'object' && e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }

  async function save(versionOverride) {
    const payload = { ...form, homepageUrl: normalizeUrlInput(form.homepageUrl) }
    if (versionOverride !== undefined) payload.version = versionOverride
    const errs = validateStay(payload)
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error('입력 내용을 확인해 줘')
      return
    }
    setSaving(true)
    try {
      const saved = await actions.saveStay(payload)
      uploads.commit(storagePaths(saved.coverImage ? [saved.coverImage] : []))
      allowNext()
      if (isNew) {
        toast.success('숙소를 등록했어! 이제 객실을 추가해 보자')
        navigate(`/stays/${saved.id}/rooms/new?first=1`, { replace: true })
      } else {
        toast.success('숙소 정보를 저장했어')
        navigate(`/stays/${saved.id}`)
      }
    } catch (err) {
      if (err.kind === 'conflict') {
        await actions.refresh({ silent: true }).catch(() => {})
        setConflict(true)
      } else toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="mx-auto max-w-3xl space-y-4 pb-28"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <div className="flex items-center gap-2">
        <Link to={isNew ? '/' : `/stays/${initial.id}`} className="icon-btn -ml-2" aria-label="뒤로">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-serif text-2xl font-bold">{isNew ? '숙소 등록' : '숙소 수정'}</h1>
      </div>
      <p className="text-sm text-muted">숙소명만 필수야. 나머지는 알게 되는 대로 나중에 채워도 돼.</p>

      <FormSection title="기본 정보" icon={Home}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="숙소명" required value={form.name} onChange={set('name')} error={errors.name} placeholder="예: 숲속 글램핑" className="sm:col-span-2" autoFocus={isNew} maxLength={100} />
          <TextInput label="지역" value={form.region} onChange={set('region')} placeholder="예: 가평" maxLength={50} />
          <Field label={<label htmlFor="stay-type">숙소 유형</label>} error={errors.stayType}>
            <select id="stay-type" className="input" value={form.stayType} onChange={set('stayType')}>
              <option value="">아직 안 정함</option>
              {STAY_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <TextInput
            className="sm:col-span-2"
            label="숙소 홈페이지 URL"
            value={form.homepageUrl}
            onChange={set('homepageUrl')}
            onBlur={() => setForm((f) => ({ ...f, homepageUrl: normalizeUrlInput(f.homepageUrl) }))}
            error={errors.homepageUrl}
            placeholder="https://"
            inputMode="url"
          />
          <TextInput label="주소" value={form.address} onChange={set('address')} placeholder="도로명 주소" className="sm:col-span-2" maxLength={300} />
        </div>
      </FormSection>

      <FormSection title="대표 사진" icon={ImageIcon} description="없으면 첫 번째 객실 사진을 대신 보여줘">
        <ImagePicker
          images={form.coverImage ? [form.coverImage] : []}
          onChange={(imgs) => setForm((f) => ({ ...f, coverImage: imgs[0] || null }))}
          multiple={false}
          folder="stays"
          onUploaded={uploads.track}
        />
        {errors.coverImage && <p className="mt-2 text-xs text-burgundy">{errors.coverImage}</p>}
      </FormSection>

      <FormSection title="메모" icon={NotebookPen}>
        <TextArea label="숙소 메모" value={form.memo} onChange={set('memo')} rows={4} placeholder="예: 후기에서 본 내용, 주변 맛집, 가는 길" maxLength={5000} />
      </FormSection>

      {!isNew && (
        <div className="flex justify-end">
          <DeleteStayButton stay={initial} onDeleted={allowNext} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-3xl justify-end gap-2 px-4 py-3">
          <button type="button" className="btn-ghost" onClick={() => navigate(isNew ? '/' : `/stays/${initial.id}`)}>
            취소
          </button>
          <button type="submit" className="btn-primary min-w-28" disabled={saving}>
            {saving ? '저장 중…' : isNew ? '등록하고 객실 추가' : '저장'}
          </button>
        </div>
      </div>

      <UnsavedDialog blocker={blocker} />
      <ConfirmDialog
        open={conflict}
        title="다른 사람이 먼저 수정했어"
        description="그사이 상대가 이 숙소를 수정했어. 지금 입력한 내용으로 덮어쓸까? 취소하면 입력 내용은 그대로 남아 있어."
        confirmLabel="내 입력으로 덮어쓰기"
        onCancel={() => setConflict(false)}
        onConfirm={() => {
          setConflict(false)
          const latest = state.stays.find((s) => s.id === initial?.id)
          if (!latest) return toast.error('숙소가 삭제되어 저장할 수 없어')
          save(latest.version)
        }}
      />
    </form>
  )
}
