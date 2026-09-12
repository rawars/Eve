import type { Rectangle } from './types'

export type EdgeIndicator = { edge: 'top' | 'right' | 'bottom' | 'left'; offset: number; length: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function offscreenIndicators(bounds: Rectangle, viewport: { width: number; height: number }): EdgeIndicator[] {
  if (viewport.width <= 0 || viewport.height <= 0) return []
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  if (bounds.x >= 0 && bounds.y >= 0 && right <= viewport.width && bottom <= viewport.height) return []

  const horizontal = () => {
    const start = clamp(bounds.x, 4, viewport.width - 4)
    const end = clamp(right, 4, viewport.width - 4)
    if (end - start >= 4) return { offset: start, length: end - start }
    return { offset: clamp(bounds.x + bounds.width / 2 - 24, 4, Math.max(4, viewport.width - 52)), length: 48 }
  }
  const vertical = () => {
    const start = clamp(bounds.y, 4, viewport.height - 4)
    const end = clamp(bottom, 4, viewport.height - 4)
    if (end - start >= 4) return { offset: start, length: end - start }
    return { offset: clamp(bounds.y + bounds.height / 2 - 24, 4, Math.max(4, viewport.height - 52)), length: 48 }
  }

  const indicators: EdgeIndicator[] = []
  if (bounds.y < 0) indicators.push({ edge: 'top', ...horizontal() })
  if (bottom > viewport.height) indicators.push({ edge: 'bottom', ...horizontal() })
  if (bounds.x < 0) indicators.push({ edge: 'left', ...vertical() })
  if (right > viewport.width) indicators.push({ edge: 'right', ...vertical() })
  return indicators
}
