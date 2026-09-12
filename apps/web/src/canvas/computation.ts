import { renderBounds, SpatialIndex, type PackedSpatialIndex } from './spatialIndex'
import type { CanvasElement } from './types'
import type { CanvasDocument } from './types'

export const WORKER_INDEX_THRESHOLD = 2_000
let computationWorker: Worker | null | undefined
let nextRequestId = 1

function getWorker() {
  if (computationWorker !== undefined) return computationWorker
  try { computationWorker = typeof Worker === 'undefined' ? null
    : new Worker(new URL('./computation.worker.ts', import.meta.url), { type: 'module' }) } catch { computationWorker = null }
  return computationWorker
}

export async function buildSpatialIndex(elements: CanvasElement[], cellSize = 512) {
  const target = elements.length >= WORKER_INDEX_THRESHOLD ? getWorker() : null
  if (!target) return new SpatialIndex(elements, cellSize)
  const bounds = new Float64Array(elements.length * 4)
  elements.forEach((element, index) => {
    const rectangle = renderBounds(element)
    bounds.set([rectangle.x, rectangle.y, rectangle.width, rectangle.height], index * 4)
  })
  const id = nextRequestId++
  return new Promise<SpatialIndex>((resolve) => {
    const listener = (event: MessageEvent<{ id: number; packed: PackedSpatialIndex }>) => {
      if (event.data.id !== id) return
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      resolve(new SpatialIndex(elements, cellSize, renderBounds, event.data.packed))
    }
    const failed = () => {
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      computationWorker = null; target.terminate(); resolve(new SpatialIndex(elements, cellSize))
    }
    target.addEventListener('message', listener); target.addEventListener('error', failed)
    target.postMessage({ id, kind: 'spatial-index', bounds, cellSize }, [bounds.buffer])
  })
}

export async function resolveVariablesOffThread(document: CanvasDocument) {
  const target = getWorker()
  if (!target) return null
  const id = nextRequestId++
  const elements = document.layers.flatMap((layer) => layer.elements).map((element) => ({ id: element.id,
    parentId: element.parentId, type: element.type, bindings: element.variableBindings,
    variableModes: element.type === 'frame' ? element.variableModes : undefined }))
  return new Promise<Map<string, Record<string, unknown>> | null>((resolve) => {
    const listener = (event: MessageEvent<{ id: number; patches?: Array<[string, Record<string, unknown>]> }>) => {
      if (event.data.id !== id) return
      target.removeEventListener('message', listener); target.removeEventListener('error', failed)
      resolve(new Map(event.data.patches ?? []))
    }
    const failed = () => { target.removeEventListener('message', listener); target.removeEventListener('error', failed); resolve(null) }
    target.addEventListener('message', listener); target.addEventListener('error', failed)
    target.postMessage({ id, kind: 'variables', collections: document.variableCollections ?? [],
      modes: document.variableModes ?? {}, elements })
  })
}
