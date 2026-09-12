import { describe, expect, it } from 'vitest'
import { snapRectangle } from './snapping'

const target = { id: 'target', name: 'Target', type: 'rectangle' as const, x: 200, y: 100,
  width: 100, height: 100, fill: '#fff', visible: true }

describe('snapRectangle', () => {
  it('snaps edges and centers within the threshold', () => {
    const result = snapRectangle({ x: 96, y: 196, width: 100, height: 100 }, [target], 5)
    expect(result.rectangle).toEqual({ x: 100, y: 200, width: 100, height: 100 })
    expect(result.guides).toEqual([
      { axis: 'x', position: 200, start: 100, end: 300 },
      { axis: 'y', position: 200, start: 100, end: 300 },
    ])
  })

  it('does not snap outside the threshold', () => {
    expect(snapRectangle({ x: 90, y: 210, width: 100, height: 100 }, [target], 5).guides).toEqual([])
  })
})
