import { describe, expect, it } from 'vitest'
import { cleanSelection, containsElementPoint, findElement, findTopElementAtPoint, getElementsBounds, interactiveElements, isElementLocked, moveLayer, updateElement } from './layers'
import type { CanvasLayer, RectangleElement } from './types'

const back: RectangleElement = { id: 'back', name: 'Back', type: 'rectangle', fill: '#fff', visible: true, x: 0, y: 0, width: 100, height: 100 }
const front: RectangleElement = { id: 'front', name: 'Front', type: 'rectangle', fill: '#000', visible: true, x: 25, y: 25, width: 100, height: 100 }
const layer = (id: string, elements: RectangleElement[]): CanvasLayer => ({ id, name: id, visible: true, expanded: true, elements })

describe('layers', () => {
  it('does not hit transparent corners of fully rounded frames', () => {
    const frame = { id: 'round-frame', name: 'Round frame', type: 'frame' as const, x: 100, y: 100, width: 100, height: 100,
      fill: '#fff', visible: true, radius: 50, clipContent: true, layoutMode: 'none' as const, gap: 0, padding: 0,
      alignX: 'start' as const, alignY: 'start' as const }
    expect(containsElementPoint(frame, { x: 198, y: 102 })).toBe(false)
    expect(containsElementPoint(frame, { x: 198, y: 150 })).toBe(true)
  })
  it('keeps only the parent when a selection also contains its descendants', () => {
    const child = { ...front, id: 'child', parentId: 'back' }
    const grandchild = { ...front, id: 'grandchild', parentId: 'child' }
    expect(cleanSelection([back, child, grandchild], ['back', 'child', 'grandchild'])).toEqual(['back'])
    expect(cleanSelection([back, child, grandchild], ['child', 'grandchild'])).toEqual(['child'])
  })

  it('hit tests from the top layer down', () => {
    expect(findTopElementAtPoint([layer('main', [back, front])], { x: 50, y: 50 })?.id).toBe('front')
  })

  it('changes the visual order without changing layer geometry', () => {
    expect(moveLayer([layer('back-layer', [back]), layer('front-layer', [front])], 'back-layer', 1).map((item) => item.id)).toEqual(['front-layer', 'back-layer'])
  })

  it('calculates one bounding area for a multi-selection', () => {
    expect(getElementsBounds([back, front])).toEqual({ x: 0, y: 0, width: 125, height: 125 })
  })

  it('inherits interaction locks from the parent layer', () => {
    const lockedLayer = { ...layer('locked', [back]), locked: true }
    expect(interactiveElements([lockedLayer])).toEqual([])
    expect(findTopElementAtPoint([lockedLayer], { x: 20, y: 20 })).toBeUndefined()
    expect(isElementLocked([lockedLayer], back.id)).toBe(true)
  })

  it('excludes individually locked elements from interaction', () => {
    const lockedElement = { ...front, locked: true }
    expect(interactiveElements([layer('main', [back, lockedElement])])).toEqual([back])
    expect(isElementLocked([layer('main', [lockedElement])], front.id)).toBe(true)
  })

  it('updates only the target layer and preserves the normalized lookup across edits', () => {
    const first = layer('first', [back])
    const second = layer('second', [front])
    const layers = [first, second]
    const moved = updateElement(layers, front.id, (element) => ({ ...element, x: 80 }))
    expect(moved[0]).toBe(first)
    expect(moved[1]).not.toBe(second)
    expect(findElement(moved, front.id)?.x).toBe(80)
    const movedAgain = updateElement(moved, front.id, (element) => ({ ...element, y: 90 }))
    expect(findElement(movedAgain, front.id)).toMatchObject({ x: 80, y: 90 })
  })
})
