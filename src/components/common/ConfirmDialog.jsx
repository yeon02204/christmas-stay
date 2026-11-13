import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

/** 네이티브 <dialog> 기반 확인창: 포커스 가두기·ESC 닫기를 브라우저가 처리한다 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default', // default | danger
  busy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel?.()
      }}
      onClick={(e) => e.target === ref.current && !busy && onCancel?.()}
      className="m-auto w-[min(92vw,420px)] rounded-3xl bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
      aria-labelledby="confirm-title"
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start gap-3">
            {tone === 'danger' && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-burgundy-soft text-burgundy">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id="confirm-title" className="font-serif text-lg font-bold">
                {title}
              </h2>
              {description && <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>}
            </div>
          </div>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy} autoFocus>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={tone === 'danger' ? 'btn bg-burgundy text-white hover:bg-burgundy-deep' : 'btn-primary'}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? '처리 중…' : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
