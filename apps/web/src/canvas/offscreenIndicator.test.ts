import { describe, expect, it } from 'vitest'
import { offscreenIndicators } from './offscreenIndicator'

describe('offscreen selection indicators', () => {
  it('shows no marker when the selection is fully visible', () => {
    expect(offscreenIndicators({ x: 20, y: 20, width: 50, height: 50 }, { width: 200, height: 200 })).toEqual([])
  })

  it('projects a partially hidden selection onto both edges of a corner', () => {
    expect(offscreenIndicators({ x: -10, y: -20, width: 50, height: 60 }, { width: 200, height: 200 }).map((item) => item.edge))
      .toEqual(['top', 'left'])
  })

  it('keeps a useful marker for a selection fully outside the viewport', () => {
    const [indicator] = offscreenIndicators({ x: -400, y: 80, width: 100, height: 40 }, { width: 200, height: 200 })
    expect(indicator).toMatchObject({ edge: 'left', offset: 80, length: 40 })
  })
})
