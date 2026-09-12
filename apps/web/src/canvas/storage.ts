import type { CanvasDocument } from './types'
import { ASSET_STORE, canvasDatabase, DOCUMENT_STORE } from './database'

export const DOCUMENT_STORAGE_KEY = 'eve.canvas.document.v1'
export const VIEWPORT_STORAGE_KEY = 'eve.canvas.viewport.v1'
const HISTORY_STORAGE_KEY = 'eve.canvas.history.v1'
const DOCUMENT_RECORD = 'current'
const ASSET_PREFIX = 'indexeddb-asset:'
let persistentSaveTimer: ReturnType<typeof setTimeout> | undefined
let pendingPersistentDocument: CanvasDocument | undefined
export type StoredViewport = { x: number; y: number; zoom: number }

function compactDocument(document: CanvasDocument): CanvasDocument {
  return document.pages?.length ? { ...document, pages: document.pages.map((page) => page.id === document.activePageId
    ? { ...page, layers: [] } : page) } : document
}

function mapDocumentImages(document: CanvasDocument, update: (element: Extract<CanvasDocument['layers'][number]['elements'][number], { type: 'image' }>) => typeof element) {
  const mapLayers = (layers: CanvasDocument['layers']) => layers.map((layer) => ({ ...layer,
    elements: layer.elements.map((element) => element.type === 'image' ? update(element) : element) }))
  return { ...document, layers: mapLayers(document.layers),
    pages: document.pages?.map((page) => ({ ...page, layers: mapLayers(page.layers) })) }
}

export function referenceDocumentAssets(document: CanvasDocument) {
  return mapDocumentImages(document, (image) => {
    const assetId = image.assetId ?? image.id
    return { ...image, assetId, src: `${ASSET_PREFIX}${assetId}` }
  })
}

async function savePersistentDocument(document: CanvasDocument) {
  const database = await canvasDatabase()
  if (!database) return
  const assets = new Map<string, Blob>()
  const referencedAssets = new Set<string>()
  const stored = mapDocumentImages(compactDocument(document), (image) => {
    const assetId = image.assetId ?? image.id
    referencedAssets.add(assetId)
    if (!image.src.startsWith(ASSET_PREFIX)) assets.set(assetId, new Blob())
    return { ...image, assetId, src: `${ASSET_PREFIX}${assetId}` }
  })
  for (const [assetId] of assets) {
    const source = findImageSource(document, assetId)
    if (!source) { assets.delete(assetId); continue }
    try { assets.set(assetId, await (await fetch(source)).blob()) } catch { assets.delete(assetId) }
  }
  await new Promise<void>((resolve) => {
    const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], 'readwrite')
    transaction.objectStore(DOCUMENT_STORE).put(stored, DOCUMENT_RECORD)
    const assetStore = transaction.objectStore(ASSET_STORE)
    assets.forEach((blob, id) => assetStore.put(blob, id))
    const keys = assetStore.getAllKeys()
    keys.onsuccess = () => keys.result.forEach((key) => { if (!referencedAssets.has(String(key))) assetStore.delete(key) })
    transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve()
  })
}

function findImageSource(document: CanvasDocument, assetId: string) {
  const layers = [...document.layers, ...(document.pages?.flatMap((page) => page.layers) ?? [])]
  return layers.flatMap((layer) => layer.elements).filter((element) => element.type === 'image')
    .find((element) => (element.assetId ?? element.id) === assetId)?.src
}

export async function loadPersistentDocument(): Promise<CanvasDocument | null> {
  const database = await canvasDatabase()
  if (!database) return null
  const stored = await new Promise<CanvasDocument | null>((resolve) => {
    const request = database.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).get(DOCUMENT_RECORD)
    request.onsuccess = () => resolve(request.result as CanvasDocument ?? null); request.onerror = () => resolve(null)
  })
  if (!stored) return null
  return hydrateDocumentAssets(stored, database)
}

export async function hydrateDocumentAssets(stored: CanvasDocument, existingDatabase?: IDBDatabase): Promise<CanvasDocument> {
  const database = existingDatabase ?? await canvasDatabase()
  if (!database) return stored
  const assetIds = new Set<string>()
  mapDocumentImages(stored, (image) => { if (image.src.startsWith(ASSET_PREFIX)) assetIds.add(image.src.slice(ASSET_PREFIX.length)); return image })
  const urls = new Map<string, string>()
  await Promise.all([...assetIds].map(async (id) => {
    const blob = await new Promise<Blob | null>((resolve) => {
      const request = database.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE).get(id)
      request.onsuccess = () => resolve(request.result as Blob ?? null); request.onerror = () => resolve(null)
    })
    if (blob) urls.set(id, URL.createObjectURL(blob))
  }))
  const hydrated = mapDocumentImages(stored, (image) => {
    const id = image.src.startsWith(ASSET_PREFIX) ? image.src.slice(ASSET_PREFIX.length) : image.assetId
    return id && urls.has(id) ? { ...image, assetId: id, src: urls.get(id)! } : image
  })
  if (!hydrated.pages?.length) return hydrated
  const active = hydrated.pages.find((page) => page.id === hydrated.activePageId) ?? hydrated.pages[0]
  const layers = active.layers.length ? active.layers : hydrated.layers
  return { ...hydrated, activePageId: active.id, layers,
    pages: hydrated.pages.map((page) => page.id === active.id ? { ...page, layers } : page) }
}

export function loadDocument(): CanvasDocument | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object' || !('layers' in value) || !Array.isArray(value.layers)) return null
    const document = value as CanvasDocument
    if (document.pages?.length) {
      const active = document.pages.find((page) => page.id === document.activePageId) ?? document.pages[0]
      const layers = active.layers.length ? active.layers : document.layers
      return { ...document, activePageId: active.id, layers,
        pages: document.pages.map((page) => page.id === active.id ? { ...page, layers } : page) }
    }
    return document.layers.length ? document : null
  } catch {
    return null
  }
}

export function saveDocument(document: CanvasDocument) {
  pendingPersistentDocument = document
  if (persistentSaveTimer) clearTimeout(persistentSaveTimer)
  persistentSaveTimer = setTimeout(() => {
    const pending = pendingPersistentDocument
    pendingPersistentDocument = undefined; persistentSaveTimer = undefined
    if (pending) void savePersistentDocument(pending)
  }, 250)
  const layers = [...document.layers, ...(document.pages?.flatMap((page) => page.layers) ?? [])]
  const elementCount = layers.reduce((count, layer) => count + layer.elements.length, 0)
  const containsBinaryAssets = layers.some((layer) => layer.elements.some((element) => element.type === 'image'))
  // Avoid duplicating large documents and base64 images in synchronous string storage.
  if (typeof indexedDB !== 'undefined' && (elementCount > 1_000 || containsBinaryAssets)) return
  const serialized = JSON.stringify(compactDocument(document))
  try { localStorage.setItem(DOCUMENT_STORAGE_KEY, serialized) } catch {
    // The editable document has priority over old history snapshots when browser storage is full.
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
      localStorage.setItem(DOCUMENT_STORAGE_KEY, serialized)
    } catch { /* The document itself may exceed browser storage. */ }
  }
}

export function loadViewport(): StoredViewport {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(VIEWPORT_STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') return { x: 0, y: 0, zoom: 1 }
    const viewport = value as Partial<StoredViewport>
    if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) || (viewport.zoom ?? 0) <= 0) {
      return { x: 0, y: 0, zoom: 1 }
    }
    return viewport as StoredViewport
  } catch { return { x: 0, y: 0, zoom: 1 } }
}

export function saveViewport(viewport: StoredViewport) {
  try { localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport)) } catch { /* Ignore unavailable storage. */ }
}
