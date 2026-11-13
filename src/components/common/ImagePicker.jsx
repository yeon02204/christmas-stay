import { useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, Trash2, Upload } from 'lucide-react'
import Photo from './Photo.jsx'
import { useToast } from './Toast.jsx'
import { uploadPhoto } from '../../services/photos.js'
import { imageRefKey } from '../../utils/models.js'
import { isValidUrl, normalizeUrlInput } from '../../utils/validation.js'

/**
 * 사진 입력: URL 여러 줄 붙여넣기 / 파일 선택 / 드래그 / 클립보드 붙여넣기(Ctrl+V)
 * 파일은 브라우저에서 압축 후 Supabase Storage 로 바로 업로드하고, 폼에는 경로만 담는다.
 * 업로드가 실패해도 폼의 다른 입력은 그대로 유지된다.
 */
export default function ImagePicker({ images, onChange, multiple = true, folder = 'rooms', onUploaded, max = 20 }) {
  const toast = useToast()
  const fileId = useId()
  const fileRef = useRef(null)
  const [urlText, setUrlText] = useState('')
  const [urlError, setUrlError] = useState(null)
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const latest = useRef(images)
  latest.current = images

  const room = max - images.length

  function push(refs) {
    const next = multiple ? [...latest.current, ...refs].slice(0, max) : refs.slice(-1)
    latest.current = next
    onChange(next)
  }

  function addUrls() {
    const lines = urlText
      .split(/[\n\s]+/)
      .map((l) => normalizeUrlInput(l))
      .filter(Boolean)
    if (!lines.length) return
    const bad = lines.filter((l) => !isValidUrl(l))
    if (bad.length) {
      setUrlError(`올바르지 않은 주소가 있어: ${bad[0].slice(0, 40)}`)
      return
    }
    const existing = new Set(images.map(imageRefKey))
    const refs = lines.map((url) => ({ type: 'url', url })).filter((r) => !existing.has(imageRefKey(r)))
    push(refs)
    setUrlText('')
    setUrlError(null)
    if (refs.length) toast.success(`사진 ${refs.length}장을 추가했어`)
  }

  async function uploadFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return toast.error('이미지 파일만 올릴 수 있어')
    const list = multiple ? files.slice(0, Math.max(0, room)) : files.slice(0, 1)
    if (!list.length) return toast.error(`사진은 최대 ${max}장까지야`)
    setUploading((n) => n + list.length)
    let ok = 0
    for (const f of list) {
      try {
        const ref = await uploadPhoto(f, folder)
        onUploaded?.(ref.path)
        push([ref])
        ok++
      } catch (err) {
        toast.error(err.message)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    if (ok) toast.success(`사진 ${ok}장을 업로드했어`)
  }

  function onPaste(e) {
    const files = [...(e.clipboardData?.files || [])]
    if (files.length) {
      e.preventDefault()
      uploadFiles(files)
    }
  }

  function move(i, d) {
    const next = [...images]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3" onPaste={onPaste}>
      {images.length > 0 && (
        <ul className={`grid gap-2.5 ${multiple ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-1 sm:max-w-sm'}`}>
          {images.map((img, i) => (
            <li key={imageRefKey(img) + i} className="group relative overflow-hidden rounded-2xl bg-cream-deep">
              <Photo image={img} alt={`사진 ${i + 1}`} className={`w-full ${multiple ? 'aspect-square' : 'aspect-[4/3]'}`} iconSize="size-5" />
              {multiple && i === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-burgundy px-2 py-0.5 text-[10px] font-bold text-white">대표</span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-ink/60 to-transparent p-1.5">
                <div className="flex gap-1">
                  {multiple && (
                    <>
                      <button type="button" className="rounded-full bg-white/90 p-1 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 사진 앞으로`}>
                        <ArrowLeft className="size-3.5" />
                      </button>
                      <button type="button" className="rounded-full bg-white/90 p-1 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label={`${i + 1}번 사진 뒤로`}>
                        <ArrowRight className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full bg-white/90 p-1 text-burgundy"
                  onClick={() => onChange(images.filter((_, n) => n !== i))}
                  aria-label={`${i + 1}번 사진 삭제`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          uploadFiles(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${dragOver ? 'border-gold bg-gold-soft' : 'border-line bg-cream/60'}`}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-3 size-4 text-muted" aria-hidden />
            <textarea
              rows={1}
              className={`input min-h-11 resize-none pl-9 ${urlError ? 'input-error' : ''}`}
              placeholder={multiple ? '사진 주소 붙여넣기 (여러 줄 가능)' : '사진 주소 붙여넣기'}
              value={urlText}
              onChange={(e) => {
                setUrlText(e.target.value)
                setUrlError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  addUrls()
                }
              }}
              aria-label="사진 URL"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1 sm:flex-none" onClick={addUrls} disabled={!urlText.trim()}>
              <ImagePlus className="size-4" aria-hidden /> URL 추가
            </button>
            <label htmlFor={fileId} className="btn-pine flex-1 cursor-pointer sm:flex-none">
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {uploading ? `업로드 중 ${uploading}` : '파일 업로드'}
            </label>
            <input
              id={fileId}
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={multiple}
              className="sr-only"
              onChange={(e) => {
                uploadFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>
        {urlError && <p className="mt-2 text-xs font-medium text-burgundy" role="alert">{urlError}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          파일을 여기로 끌어오거나 복사한 이미지를 <kbd className="rounded bg-white px-1">Ctrl+V</kbd>로 붙여넣어도 돼. 업로드한 사진은 자동으로 줄여서(최대 1600px) 저장해.
          {multiple && ` (${images.length}/${max}장)`}
        </p>
      </div>
    </div>
  )
}
