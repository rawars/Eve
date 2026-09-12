const MAX_SOURCE_DIMENSION = 2048
const MAX_CANVAS_DIMENSION = 480
let worker: Worker | null | undefined
let nextRequestId = 1

function readFile(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image data'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode image'))
    image.src = src
  })
}

function imageWorker() {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    worker = null; return worker
  }
  try { worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' }) } catch { worker = null }
  return worker
}

async function prepareInWorker(file: File) {
  const target = imageWorker()
  if (!target) return null
  const id = nextRequestId++
  const result = await new Promise<{ blob?: Blob; width?: number; height?: number; error?: string }>((resolve) => {
    const listener = (event: MessageEvent<{ id: number; blob?: Blob; width?: number; height?: number; error?: string }>) => {
      if (event.data.id !== id) return
      target.removeEventListener('message', listener)
      target.removeEventListener('error', failed)
      resolve(event.data)
    }
    const failed = () => {
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      worker = null; target.terminate(); resolve({ error: 'Image worker failed' })
    }
    target.addEventListener('message', listener)
    target.addEventListener('error', failed)
    target.postMessage({ id, file, maxSourceDimension: MAX_SOURCE_DIMENSION, maxCanvasDimension: MAX_CANVAS_DIMENSION })
  })
  if (result.error || !result.blob || !result.width || !result.height) return null
  return { name: file.name.replace(/\.[^.]+$/, '') || 'Image', src: await readFile(result.blob),
    width: result.width, height: result.height }
}

export async function prepareImageFile(file: File) {
  const prepared = await prepareInWorker(file)
  if (prepared) return prepared
  const originalSrc = await readFile(file)
  const image = await loadImage(originalSrc)
  const sourceScale = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * sourceScale))
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * sourceScale))
  let src = originalSrc
  if (sourceScale < 1) {
    const canvas = document.createElement('canvas')
    canvas.width = sourceWidth
    canvas.height = sourceHeight
    canvas.getContext('2d')?.drawImage(image, 0, 0, sourceWidth, sourceHeight)
    src = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9)
  }
  const displayScale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(sourceWidth, sourceHeight))
  return {
    name: file.name.replace(/\.[^.]+$/, '') || 'Image',
    src,
    width: Math.max(1, Math.round(sourceWidth * displayScale)),
    height: Math.max(1, Math.round(sourceHeight * displayScale)),
  }
}
