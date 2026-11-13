/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const STYLES = {
  success: { icon: CheckCircle2, cls: 'bg-pine text-white' },
  error: { icon: AlertCircle, cls: 'bg-burgundy text-white' },
  info: { icon: Info, cls: 'bg-ink text-white' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const show = useCallback(
    (message, type = 'success', ms) => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-2), { id, message, type }])
      setTimeout(() => dismiss(id), ms ?? (type === 'error' ? 6000 : 2800))
    },
    [dismiss],
  )
  const api = useMemo(
    () => ({
      success: (m) => show(m, 'success'),
      error: (m) => show(typeof m === 'string' ? m : m?.message || '오류가 발생했어', 'error'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = STYLES[t.type]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex max-w-md animate-fade-up items-start gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-lift ${cls}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1 leading-relaxed">{t.message}</span>
              <button className="-m-1 rounded-full p-1 opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="알림 닫기">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
