import { describe, expect, it } from 'vitest'
import { packSpatialBounds, renderBounds, SpatialIndex } from './spatialIndex'
import type { RectangleElement } from './types'

const rectangle = (id: string, x: number, y: number, width = 20, height = 20): RectangleElement => ({
  id, name: id, type: 'rectangle', x, y, width, height, radius: 0, fill: '#000', visible: true,
})

describe('SpatialIndex', () => {
  it('returns intersecting elements in their document order', () => {
    const index = new SpatialIndex([rectangle('outside', 1000, 1000), rectangle('back', 10, 10), rectangle('front', 15, 15)])
    expect(index.query({ x: 0, y: 0, width: 100, height: 100 }).map((element) => element.id)).toEqual(['back', 'front'])
  })

  it('keeps very large elements queryable without indexing every covered cell', () => {
    const index = new SpatialIndex([rectangle('background', -100000, -100000, 200000, 200000)])
    expect(index.query({ x: 5000, y: 5000, width: 100, height: 100 })[0]?.id).toBe('background')
  })

  it('hydrates the transferable worker representation without changing queries', () => {
    const elements = [rectangle('outside', 1000, 1000), rectangle('inside', 20, 30)]
    const packed = packSpatialBounds(elements.map(renderBounds))
    const index = new SpatialIndex(elements, 512, renderBounds, packed)
    expect(index.query({ x: 0, y: 0, width: 100, height: 100 }).map((element) => element.id)).toEqual(['inside'])
  })
})
