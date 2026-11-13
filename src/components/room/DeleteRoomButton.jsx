import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import { useToast } from '../common/Toast.jsx'
import { useStore, useIsGuest } from '../../store/AppStore.jsx'

export default function DeleteRoomButton(props) {
  if (useIsGuest()) return null // 구경 모드: 삭제 불가
  return <DeleteRoomButtonInner {...props} />
}

function DeleteRoomButtonInner({ room, onDeleted, className = 'btn-danger' }) {
  const { actions } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await actions.deleteRoom(room.id)
      onDeleted?.()
      toast.success(`"${room.name}" 객실을 삭제했어`)
      navigate(`/stays/${room.stayId}`, { replace: true })
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden /> 객실 삭제
      </button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title={`"${room.name}" 객실을 삭제할까?`}
        description="날짜별 가격·사진과 함께 두 사람의 찜·평가·비교 목록에서도 빠져. 삭제하면 되돌릴 수 없어."
        confirmLabel="삭제"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  )
}
