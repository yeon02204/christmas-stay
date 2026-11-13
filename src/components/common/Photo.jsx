import { useState } from 'react'
import { ImageOff, TreePine } from 'lucide-react'
import { photoUrl } from '../../services/photos.js'

/** 이미지 참조(URL / Storage)를 표시. 없거나 깨지면 따뜻한 플레이스홀더 */
export default function Photo({ image, alt = '', className = '', iconSize = 'size-8', label }) {
  const src = photoUrl(image)
  const [failedSrc, setFailedSrc] = useState(null)
  const failed = !!src && failedSrc === src

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-pine-soft via-cream-deep to-gold-soft text-pine/45 ${className}`}
        role="img"
        aria-label={alt ? `${alt} (사진 없음)` : '사진 없음'}
      >
        {failed ? <ImageOff className={iconSize} strokeWidth={1.4} /> : <TreePine className={iconSize} strokeWidth={1.4} />}
        {(label || failed) && (
          <span className="px-2 text-center text-[11px] font-medium text-pine/60">
            {failed ? '사진을 불러올 수 없어' : label}
          </span>
        )}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`object-cover ${className}`}
      onError={() => setFailedSrc(src)}
    />
  )
}
