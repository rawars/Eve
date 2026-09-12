import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasDocument } from './types'
import { DOCUMENT_STORAGE_KEY, loadDocument, saveDocument } from './storage'

const document: CanvasDocument = {
  activePageId: 'page-1', activeElementId: null, selectedElementIds: [], background: '#fff',
  layers: [{ id: 'layer-1', name: 'Layer', visible: true, expanded: true, elements: [] }],
  pages: [{ id: 'page-1', name: 'Page 1', layers: [{ id: 'layer-1', name: 'Layer', visible: true, expanded: true, elements: [] }] }],
}

describe('document storage', () => {
  beforeEach(() => localStorage.clear())

  it('stores the active canvas only once and restores it from its page', () => {
    saveDocument(document)
    const stored = JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? '{}')
    expect(stored.layers).toEqual(document.layers)
    expect(stored.pages[0].layers).toEqual([])
    expect(loadDocument()?.layers).toEqual(document.layers)
  })

  it('drops old history and retries when quota is exhausted', () => {
    localStorage.setItem('eve.canvas.history.v1', 'old history')
    const original = Storage.prototype.setItem
    let failed = false
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === DOCUMENT_STORAGE_KEY && !failed) { failed = true; throw new DOMException('Quota exceeded', 'QuotaExceededError') }
      return original.call(this, key, value)
    })
    saveDocument(document)
    expect(localStorage.getItem('eve.canvas.history.v1')).toBeNull()
    expect(loadDocument()).not.toBeNull()
    setItem.mockRestore()
  })
})
