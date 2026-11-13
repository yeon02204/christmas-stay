import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Photo from '../common/Photo.jsx'
import { imageRefKey } from '../../utils/models.js'

/**
 * 여러 장의 사진을 넘겨 보는 갤러리.
 * - 좌우 버튼, 스와이프, 키보드(←/→), 점 표시, (옵션) 썸네일
 */
export default function ImageGallery({ images = [], alt = '', className = 'aspect-[4/3]', thumbnails = false, rounded = 'rounded-3xl' }) {
  const [index, setIndex] = useState(0)
  const touch = useRef(null)
  const count = images.length
  const i = count ? Math.min(index, count - 1) : 0

  const go = (d) => count > 1 && setIndex((v) => (Math.min(v, count - 1) + d + count) % count)

  if (!count) {
    return <Photo image={null} alt={alt} label="등록된 사진 없음" className={`w-full ${className} ${rounded}`} />
  }

  return (
    <div>
      <div
        className={`group relative overflow-hidden bg-cream-deep ${rounded} ${className}`}
        role="region"
        aria-roledescription="사진 갤러리"
        aria-label={`${alt} 사진 ${count}장`}
        tabIndex={count > 1 ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(-1)
          if (e.key === 'ArrowRight') go(1)
        }}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return
          const dx = e.changedTouches[0].clientX - touch.current
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      >
        <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
          {images.map((img, n) => (
            <div key={imageRefKey(img) + n} className="h-full w-full shrink-0" aria-hidden={n !== i}>
              <Photo image={img} alt={`${alt} 사진 ${n + 1}`} className="h-full w-full" />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                go(-1)
              }}
              className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-soft transition-opacity hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
              aria-label="이전 사진"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                go(1)
              }}
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-soft transition-opacity hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
              aria-label="다음 사진"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute right-3 top-3 rounded-full bg-ink/55 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              {i + 1} / {count}
            </span>
            <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5" aria-hidden>
              {images.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {thumbnails && count > 1 && (
        <div className="scrollbar-thin mt-2.5 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, n) => (
            <button
              key={imageRefKey(img) + n}
              type="button"
              onClick={() => setIndex(n)}
              className={`size-16 shrink-0 overflow-hidden rounded-xl ring-2 transition ${n === i ? 'ring-burgundy' : 'ring-transparent opacity-70 hover:opacity-100'}`}
              aria-label={`${n + 1}번 사진 보기`}
              aria-current={n === i}
            >
              <Photo image={img} alt="" className="h-full w-full" iconSize="size-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
