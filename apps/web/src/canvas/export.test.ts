import { describe, expect, it } from 'vitest'
import { serializeDocument } from './export'
import type { CanvasDocument } from './types'

describe('canvas export', () => {
  it('exports a versioned document without transient selection state', () => {
    const document: CanvasDocument = {
      activeElementId: 'rectangle-1', selectedElementIds: ['rectangle-1'],
      layers: [{ id: 'layer-1', name: 'Main', visible: true, expanded: true, elements: [
        { id: 'rectangle-1', name: 'Rectangle', type: 'rectangle', fill: '#fff', visible: true,
          x: 10, y: 20, width: 100, height: 80 },
      ] }],
    }
    const exported = JSON.parse(serializeDocument(document))
    expect(exported).toMatchObject({ format: 'eve-canvas', version: 1, layers: document.layers })
    expect(exported).not.toHaveProperty('activeElementId')
    expect(exported).not.toHaveProperty('selectedElementIds')
  })
})
