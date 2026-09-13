import { describe, expect, it } from 'vitest'
import { aiContext, aiHistoryLabel, applyAiStructure } from './aiEdits'
import type { CanvasDocument, FrameElement, RectangleElement } from './types'

const frame: FrameElement = { id: 'frame', name: 'Card', type: 'frame', x: 10, y: 20, width: 200, height: 120,
  fill: '#fff', visible: true, clipContent: true, layoutMode: 'vertical', gap: 8, padding: 16, alignX: 'start', alignY: 'start' }
const child: RectangleElement = { id: 'child', parentId: 'frame', name: 'Body', type: 'rectangle', x: 26, y: 36,
  width: 168, height: 40, fill: '#eee', visible: true }
const document: CanvasDocument = { layers: [{ id: 'layer', name: 'Layer', expanded: true, visible: true, elements: [frame, child] }],
  activeElementId: 'frame', selectedElementIds: ['frame'] }

describe('AI canvas edits', () => {
  it('collects only the selected container subtree', () => {
    expect(aiContext(document, 'frame').elements).toEqual([frame, child])
  })

  it('atomically replaces a valid subtree', () => {
    const added = { ...child, id: 'new-child', name: 'Action', y: 84 }
    const next = applyAiStructure(document, 'frame', { summary: 'Added action', elements: [frame, child, added] })
    expect(next.layers[0].elements.map(({ id }) => id)).toEqual(['frame', 'child', 'new-child'])
    expect(document.layers[0].elements).toHaveLength(2)
  })

  it('rejects structures that escape the selected container', () => {
    expect(() => applyAiStructure(document, 'frame', { summary: 'Bad', elements: [frame, { ...child, parentId: 'outside' }] }))
      .toThrow('outside the selected container')
  })

  it('creates a concise history label', () => {
    expect(aiHistoryLabel('  Add   a button  ')).toBe('AI · Add a button')
  })
})
