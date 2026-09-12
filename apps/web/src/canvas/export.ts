import type { CanvasDocument } from './types'

let serializationWorker: Worker | null | undefined
let nextSerializationId = 1

export function serializeDocument(document: CanvasDocument) {
  return JSON.stringify({
    format: 'eve-canvas',
    version: 1,
    layers: document.layers,
    pages: document.pages,
    activePageId: document.activePageId,
    variableCollections: document.variableCollections,
    variableModes: document.variableModes,
  }, null, 2)
}

async function serializedBlob(document: CanvasDocument) {
  if (serializationWorker === undefined) {
    try { serializationWorker = typeof Worker === 'undefined' ? null
      : new Worker(new URL('./serialization.worker.ts', import.meta.url), { type: 'module' }) } catch { serializationWorker = null }
  }
  if (!serializationWorker) return new Blob([serializeDocument(document)], { type: 'application/json' })
  const target = serializationWorker
  const id = nextSerializationId++
  return new Promise<Blob>((resolve) => {
    const listener = (event: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      if (event.data.id !== id) return
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      resolve(event.data.blob ?? new Blob([serializeDocument(document)], { type: 'application/json' }))
    }
    const failed = () => {
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      serializationWorker = null; target.terminate()
      resolve(new Blob([serializeDocument(document)], { type: 'application/json' }))
    }
    target.addEventListener('message', listener); target.addEventListener('error', failed)
    target.postMessage({ id, document })
  })
}

export async function downloadDocument(document: CanvasDocument) {
  const blob = await serializedBlob(document)
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = 'eve-canvas.json'
  link.click()
  URL.revokeObjectURL(url)
}
