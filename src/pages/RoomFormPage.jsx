import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, CalendarClock, Coins, Home, ImageIcon, Sparkles, Trees } from 'lucide-react'
import { FormSection, NumberInput, TextArea, TextInput, TriState } from '../components/common/fields.jsx'
import ImagePicker from '../components/common/ImagePicker.jsx'
import ConfirmDialog from '../components/common/ConfirmDialog.jsx'
import UnsavedDialog from '../components/common/UnsavedDialog.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import { useToast } from '../components/common/Toast.jsx'
import RatesEditor from '../components/room/RatesEditor.jsx'
import DeleteRoomButton from '../components/room/DeleteRoomButton.jsx'
import { useDerived, useStore } from '../store/AppStore.jsx'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard.js'
import { isEqualJson, storagePaths, useUploadTracker } from '../hooks/useFormHelpers.js'
import { FACILITIES, MOOD_FIELDS, createEmptyRoom } from '../utils/models.js'
import { normalizeUrlInput, validateRoom } from '../utils/validation.js'

export default function RoomFormPage() {
  const { stayId, roomId } = useParams()
  const location = useLocation()
  const { staysById, roomsById } = useDerived()
  const stay = staysById[stayId]
  const room = roomId ? roomsById[roomId] : null
  if (!stay || (roomId && !room)) {
    return (
      <EmptyState
        icon={Home}
        title={stay ? '객실을 찾을 수 없어' : '숙소를 찾을 수 없어'}
        description="삭제되었거나 주소가 잘못됐어."
        action={<Link to={stay ? `/stays/${stay.id}` : '/'} className="btn-primary">돌아가기</Link>}
      />
    )
  }
  return <RoomForm key={roomId || `new-${location.key}`} stay={stay} initial={room} />
}

function RoomForm({ stay, initial }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const { state, actions } = useStore()
  const { key: tripKey, roomsByStay } = useDerived()
  const isNew = !initial
  const base = useMemo(() => (initial ? structuredClone(initial) : createEmptyRoom(stay.id)), [initial, stay.id])
  const [form, setForm] = useState(base)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(null) // null | 'save' | 'next'
  const [conflict, setConflict] = useState(null)
  const uploads = useUploadTracker()
  const dirty = !isEqualJson(form, base)
  const { blocker, allowNext } = useUnsavedGuard(dirty && !saving)
  const roomCount = (roomsByStay[stay.id] || []).length

  const set = (k) => (e) => {
    const v = typeof e === 'object' && e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }
  const filledFacilities = FACILITIES.filter((f) => form.facilities[f.key] !== 'unknown').length
  const filledMood = MOOD_FIELDS.filter((m) => form.mood[m.key]?.trim()).length

  async function save(mode, versionOverride) {
    const payload = { ...form, bookingUrl: normalizeUrlInput(form.bookingUrl) }
    if (versionOverride !== undefined) payload.version = versionOverride
    const errs = validateRoom(payload)
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast.error('입력 내용을 확인해 줘')
      return
    }
    setSaving(mode)
    try {
      const saved = await actions.saveRoom(payload)
      uploads.commit(storagePaths(saved.images))
      allowNext()
      toast.success(isNew ? `"${saved.name}" 객실을 등록했어` : '객실 정보를 저장했어')
      if (mode === 'next') navigate(`/stays/${stay.id}/rooms/new`, { replace: true })
      else navigate(`/stays/${stay.id}/rooms/${saved.id}`, { replace: isNew })
    } catch (err) {
      if (err.kind === 'conflict') {
        await actions.refresh({ silent: true }).catch(() => {})
        setConflict(mode)
      } else toast.error(err)
    } finally {
      setSaving(null)
    }
  }

  return (
    <form
      className="mx-auto max-w-3xl space-y-4 pb-32"
      onSubmit={(e) => {
        e.preventDefault()
        save('save')
      }}
      noValidate
    >
      <div className="flex items-center gap-2">
        <Link to={`/stays/${stay.id}`} className="icon-btn -ml-2" aria-label="숙소로 돌아가기">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted">{stay.name}</p>
          <h1 className="font-serif text-2xl font-bold">{isNew ? `객실 추가${roomCount ? ` (${roomCount + 1}번째)` : ''}` : '객실 수정'}</h1>
        </div>
      </div>
      {params.get('first') && isNew && (
        <p className="rounded-2xl bg-pine-soft px-4 py-3 text-sm text-pine">
          숙소를 등록했어. 이제 객실을 추가해 보자. 객실명만 필수고, 아는 정보만 채워도 돼.
        </p>
      )}

      <FormSection title="기본 정보" icon={BedDouble}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="객실명" required value={form.name} onChange={set('name')} error={errors.name} placeholder="예: 숲속 돔 A동" className="sm:col-span-2" autoFocus={isNew} maxLength={100} />
          <NumberInput label="기준 인원" value={form.baseGuests} onChange={set('baseGuests')} error={errors.baseGuests} suffix="명" />
          <NumberInput label="최대 인원" value={form.maxGuests} onChange={set('maxGuests')} error={errors.maxGuests} suffix="명" />
          <TextInput label="객실 크기" value={form.size} onChange={set('size')} placeholder="예: 10평, 33㎡" maxLength={50} />
          <TextInput label="침대 형태" value={form.bedType} onChange={set('bedType')} placeholder="예: 퀸 1" maxLength={100} />
          <TextArea label="객실 설명" value={form.description} onChange={set('description')} className="sm:col-span-2" rows={3} maxLength={5000} />
        </div>
      </FormSection>

      <FormSection title="가격 · 예약 가능 여부" icon={Coins} description="날짜 구간별로 따로 저장돼">
        <RatesEditor form={form} setForm={setForm} tripKey={tripKey} errors={errors} />
      </FormSection>

      <FormSection title="사진" icon={ImageIcon} description="첫 번째 사진이 대표 사진이야" badge={<span className="chip bg-cream-deep text-muted">{form.images.length}장</span>}>
        <ImagePicker images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} onUploaded={uploads.track} />
        {Object.keys(errors).some((k) => k.startsWith('image_')) && <p className="mt-2 text-xs text-burgundy">올바르지 않은 사진 주소가 있어</p>}
      </FormSection>

      <FormSection
        title="시설"
        icon={Trees}
        defaultOpen={!isNew && filledFacilities > 0}
        description="모르는 건 ‘확인 필요’로 두면 돼"
        badge={<span className="chip bg-cream-deep text-muted tabular-nums">{filledFacilities}/{FACILITIES.length}</span>}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {FACILITIES.map((f) => (
            <TriState
              key={f.key}
              label={f.label}
              value={form.facilities[f.key]}
              onChange={(v) => setForm((x) => ({ ...x, facilities: { ...x.facilities, [f.key]: v } }))}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="분위기"
        icon={Sparkles}
        defaultOpen={!isNew && filledMood > 0}
        badge={<span className="chip bg-cream-deep text-muted tabular-nums">{filledMood}/{MOOD_FIELDS.length}</span>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {MOOD_FIELDS.map((m) => (
            <TextInput
              key={m.key}
              label={m.label}
              value={form.mood[m.key]}
              placeholder={m.placeholder}
              maxLength={500}
              onChange={(e) => setForm((x) => ({ ...x, mood: { ...x.mood, [m.key]: e.target.value } }))}
            />
          ))}
        </div>
      </FormSection>

      <FormSection title="이용 정보" icon={CalendarClock} defaultOpen={!isNew}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="체크인" value={form.checkIn} onChange={set('checkIn')} placeholder="예: 15:00" maxLength={20} />
          <TextInput label="체크아웃" value={form.checkOut} onChange={set('checkOut')} placeholder="예: 11:00" maxLength={20} />
          <TextInput
            label="예약 링크"
            value={form.bookingUrl}
            onChange={set('bookingUrl')}
            onBlur={() => setForm((f) => ({ ...f, bookingUrl: normalizeUrlInput(f.bookingUrl) }))}
            error={errors.bookingUrl}
            placeholder="https://"
            inputMode="url"
            className="sm:col-span-2"
          />
          <TextArea label="취소 및 환불 규정" value={form.cancelPolicy} onChange={set('cancelPolicy')} className="sm:col-span-2" rows={3} maxLength={5000} />
          <TextArea label="기타 메모" value={form.notes} onChange={set('notes')} className="sm:col-span-2" rows={3} maxLength={5000} />
        </div>
      </FormSection>

      {!isNew && (
        <div className="flex justify-end">
          <DeleteRoomButton room={initial} onDeleted={allowNext} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 px-4 py-3">
          <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={() => navigate(`/stays/${stay.id}`)}>
            취소
          </button>
          <button type="button" className="btn-outline" disabled={!!saving} onClick={() => save('next')}>
            {saving === 'next' ? '저장 중…' : '저장하고 다음 객실'}
          </button>
          <button type="submit" className="btn-primary min-w-24" disabled={!!saving}>
            {saving === 'save' ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      <UnsavedDialog blocker={blocker} />
      <ConfirmDialog
        open={!!conflict}
        title="다른 사람이 먼저 수정했어"
        description="그사이 상대가 이 객실을 수정했어. 지금 입력한 내용으로 덮어쓸까? 취소하면 입력 내용은 그대로 남아 있어."
        confirmLabel="내 입력으로 덮어쓰기"
        onCancel={() => setConflict(null)}
        onConfirm={() => {
          const mode = conflict
          setConflict(null)
          const latest = state.rooms.find((r) => r.id === initial?.id)
          if (!latest) return toast.error('객실이 삭제되어 저장할 수 없어')
          save(mode, latest.version)
        }}
      />
    </form>
  )
}
