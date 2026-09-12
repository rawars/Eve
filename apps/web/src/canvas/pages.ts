import type { CanvasDocument, CanvasPage } from './types'

export const DEFAULT_PAGE_ID = 'page-1'

export function ensurePagesDocument(document: CanvasDocument): CanvasDocument {
  if (document.pages?.length) {
    const active = document.pages.find((page) => page.id === document.activePageId) ?? document.pages[0]
    return { ...document, activePageId: active.id, layers: active.layers }
  }
  const page: CanvasPage = { id: DEFAULT_PAGE_ID, name: 'Page 1', layers: document.layers }
  return { ...document, activePageId: page.id, pages: [page], layers: page.layers }
}

export function syncActivePage(document: CanvasDocument): CanvasDocument {
  if (!document.pages?.length || !document.activePageId) return document
  return { ...document, pages: document.pages.map((page) => page.id === document.activePageId
    ? { ...page, layers: document.layers } : page) }
}

export function allDocumentLayers(document: CanvasDocument) {
  if (!document.pages?.length) return document.layers
  const synced = syncActivePage(document)
  return synced.pages!.flatMap((page) => page.layers)
}

export function switchDocumentPage(document: CanvasDocument, pageId: string): CanvasDocument {
  const synced = syncActivePage(document)
  const page = synced.pages?.find((candidate) => candidate.id === pageId)
  if (!page) return document
  return { ...synced, activePageId: page.id, layers: page.layers, activeElementId: null, selectedElementIds: [] }
}
