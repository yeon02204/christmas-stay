// 업로드 이미지를 브라우저에서 리사이즈·압축한다.

const MAX_SIDE = 1600
const QUALITY = 0.82
const MAX_INPUT_BYTES = 25 * 1024 * 1024

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`"${file.name || '이미지'}"를 읽을 수 없어. JPG, PNG, WEBP 형식을 사용해 줘.`))
    }
    img.src = url
  })
}

export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}"은(는) 이미지 파일이 아니야`)
  if (file.size > MAX_INPUT_BYTES) throw new Error(`"${file.name}"이(가) 너무 커 (최대 25MB)`)
  const { img, url } = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff' // 투명 PNG 를 JPEG 로 바꿀 때 검은 배경 방지
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('이미지 압축에 실패했어')
    // 원본이 이미 작고 허용 형식(jpg/png/webp)이면 원본 유지
    const keepOriginal = blob.size >= file.size && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && scale === 1
    return keepOriginal ? file : blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
