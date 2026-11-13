import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import { useToast } from '../common/Toast.jsx'
import { useStore } from '../../store/AppStore.jsx'

export default function DeleteStayButton({ stay, onDeleted, className = 'btn-danger' }) {
  const { actions } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [impact, setImpact] = useState(null)
  const [busy, setBusy] = useState(false)

  async function open() {
    try {
      setImpact(await actions.getDeleteImpact(stay.id))
    } catch (err) {
      toast.error(err)
    }
  }
  async function confirm() {
    setBusy(true)
    try {
      await actions.deleteStay(stay.id)
      onDeleted?.()
      toast.success(`"${stay.name}"을(를) 삭제했어`)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
      setImpact(null)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        <Trash2 className="size-4" aria-hidden /> 숙소 삭제
      </button>
      <ConfirmDialog
        open={!!impact}
        tone="danger"
        title={`"${stay.name}"을(를) 삭제할까?`}
        busy={busy}
        confirmLabel="삭제"
        onCancel={() => setImpact(null)}
        onConfirm={confirm}
        description={
          impact && (
            <>
              <p>삭제하면 되돌릴 수 없어. 함께 삭제되는 항목:</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                <li>객실 {impact.rooms}개와 날짜별 가격·사진</li>
                <li>두 사람의 찜 {impact.favorites}건 · 평가 {impact.ratings}건</li>
                <li>두 사람의 비교 목록에서 {impact.compares}건</li>
              </ul>
            </>
          )
        }
      />
    </>
  )
}
