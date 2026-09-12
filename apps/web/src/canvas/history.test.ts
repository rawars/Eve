import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeChange, documentContent, saveHistory } from './history'
import type { CanvasDocument } from './types'

const empty: CanvasDocument = { layers: [], activeElementId: null, selectedElementIds: [] }

describe('canvas history', () => {
  afterEach(() => vi.restoreAllMocks())
  it('ignores transient selection state', () => {
    expect(documentContent(empty)).toBe(documentContent({ ...empty, activeElementId: 'one', selectedElementIds: ['one'] }))
  })
  it('tracks variable and mode changes', () => {
    const withVariables: CanvasDocument = { ...empty, variableCollections: [{ id: 'theme', name: 'Theme',
      modes: [{ id: 'light', name: 'Light' }], variables: [{ id: 'background', name: 'Background', type: 'color',
        values: { light: '#FFFFFF' } }] }] }
    expect(documentContent(withVariables)).not.toBe(documentContent(empty))
    expect(documentContent({ ...withVariables, variableModes: { theme: 'light' } })).not.toBe(documentContent(withVariables))
  })
  it('describes additions', () => {
    const next: CanvasDocument = { ...empty, layers: [{ id: 'layer', name: 'Layer', visible: true, expanded: true,
      elements: [{ id: 'rect', name: 'Rect', type: 'rectangle', fill: '#D9D9D9', visible: true, x: 0, y: 0, width: 10, height: 10 }] }] }
    expect(describeChange(empty, next)).toBe('Element added')
  })
  it('retains the newest snapshots when local storage reaches quota', () => {
    const writes: string[] = []
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((_key, value) => {
      if (value.length > 350) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      writes.push(value)
    })
    const entries = Array.from({ length: 8 }, (_, index) => ({ id: `${index}`, createdAt: index,
      label: `Change ${index}`, document: { ...empty, background: `#00000${index}` } }))
    saveHistory(entries)
    const retained = JSON.parse(writes.at(-1) ?? '[]') as typeof entries
    expect(retained.at(-1)?.id).toBe('7')
    expect(retained.length).toBeLessThan(entries.length)
  })
})
