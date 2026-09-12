import type { CanvasDocument } from './types'
import { canvasDatabase, HISTORY_STORE } from './database'
import { referenceDocumentAssets } from './storage'

export const HISTORY_STORAGE_KEY = 'eve.canvas.history.v1'
const HISTORY_RECORD = 'current'

export type HistoryEntry = {
  id: string
  createdAt: number
  label: string
  document: CanvasDocument
}

export const documentContent = (document: CanvasDocument) => JSON.stringify({ layers: document.layers, pages: document.pages, activePageId: document.activePageId,
  background: document.background, variableCollections: document.variableCollections, variableModes: document.variableModes })

export function describeChange(previous: CanvasDocument | undefined, next: CanvasDocument) {
  if (!previous) return 'Canvas created'
  if (previous.activePageId !== next.activePageId) return 'Page changed'
  if ((previous.pages?.length ?? 1) !== (next.pages?.length ?? 1)) return (next.pages?.length ?? 1) > (previous.pages?.length ?? 1) ? 'Page added' : 'Page deleted'
  const before = previous.layers.flatMap((layer) => layer.elements)
  const after = next.layers.flatMap((layer) => layer.elements)
  if (after.length > before.length) return 'Element added'
  if (after.length < before.length) return 'Element deleted'
  const beforeNames = previous.layers.flatMap((layer) => [layer.name, ...layer.elements.map((item) => item.name)])
  const afterNames = next.layers.flatMap((layer) => [layer.name, ...layer.elements.map((item) => item.name)])
  if (JSON.stringify(beforeNames) !== JSON.stringify(afterNames)) return 'Name changed'
  return 'Canvas updated'
}

export function loadHistory(): HistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value as HistoryEntry[] : []
  } catch { return [] }
}

export async function loadPersistentHistory(): Promise<HistoryEntry[]> {
  const fallback = loadHistory()
  const database = await canvasDatabase()
  if (!database) return fallback
  return new Promise((resolve) => {
    const request = database.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(HISTORY_RECORD)
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as HistoryEntry[] : fallback)
    request.onerror = () => resolve(fallback)
  })
}

async function savePersistentHistory(history: HistoryEntry[]) {
  const database = await canvasDatabase()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(HISTORY_STORE, 'readwrite')
    transaction.objectStore(HISTORY_STORE).put(history.map((entry) => ({ ...entry,
      document: referenceDocumentAssets(entry.document) })), HISTORY_RECORD)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
}

export function saveHistory(history: HistoryEntry[]) {
  void savePersistentHistory(history.slice(-50))
  // Keep the newest snapshots that fit. History must never prevent the editable
  // document from being persisted when image data or large scenes exhaust quota.
  let retained = typeof indexedDB === 'undefined' ? history : history.map((entry) => ({ ...entry,
    document: referenceDocumentAssets(entry.document) }))
  while (retained.length) {
    try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(retained)); return } catch {
      retained = retained.slice(Math.max(1, Math.floor(retained.length / 2)))
    }
  }
  try { localStorage.removeItem(HISTORY_STORAGE_KEY) } catch { /* Storage can be unavailable. */ }
}
