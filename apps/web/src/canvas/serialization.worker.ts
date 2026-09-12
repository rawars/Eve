import type { CanvasDocument } from './types'

type SerializationRequest = { id: number; document: CanvasDocument }
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SerializationRequest>) => void) | null
  postMessage: (message: unknown) => void
}

workerScope.onmessage = ({ data: { id, document } }) => {
  try {
    const serialized = JSON.stringify({ format: 'eve-canvas', version: 1, layers: document.layers,
      pages: document.pages, activePageId: document.activePageId,
      variableCollections: document.variableCollections, variableModes: document.variableModes }, null, 2)
    workerScope.postMessage({ id, blob: new Blob([serialized], { type: 'application/json' }) })
  } catch (error) {
    workerScope.postMessage({ id, error: error instanceof Error ? error.message : 'Could not serialize document' })
  }
}

export {}
