import { describe, expect, it } from 'vitest'
import { getHandleAtPoint, getRadiusHandlePoints } from './geometry'

describe('radius handles', () => {
  it('tracks the actual radius instead of racing toward the center of wide frames', () => {
    const points = getRadiusHandlePoints({ x: 100, y: 80, width: 300, height: 100, radius: 30 })
    expect(points['top-left']).toEqual({ x: 130, y: 110 })
    expect(points['top-right']).toEqual({ x: 370, y: 110 })
  })

  it('stops at the maximum valid radius on both axes', () => {
    const points = getRadiusHandlePoints({ x: 0, y: 0, width: 300, height: 100, radius: 80 })
    expect(points['top-left']).toEqual({ x: 50, y: 50 })
  })

  it('can limit rectangle resizing to corner handles', () => {
    const rectangle = { x: 100, y: 100, width: 200, height: 100 }
    expect(getHandleAtPoint(rectangle, { x: 200, y: 100 }, 1, true)).toBeUndefined()
    expect(getHandleAtPoint(rectangle, { x: 100, y: 100 }, 1, true)).toBe('north-west')
  })
})
