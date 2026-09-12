import type { CanvasElement, Rectangle } from './types'

export type SnapGuide = { axis: 'x' | 'y'; position: number; start: number; end: number }

const anchors = (rectangle: Rectangle) => ({
  x: [rectangle.x, rectangle.x + rectangle.width / 2, rectangle.x + rectangle.width],
  y: [rectangle.y, rectangle.y + rectangle.height / 2, rectangle.y + rectangle.height],
})

export function snapRectangle(rectangle: Rectangle, targets: CanvasElement[], threshold: number) {
  const moving = anchors(rectangle)
  let bestX: { distance: number; target: CanvasElement; position: number } | undefined
  let bestY: { distance: number; target: CanvasElement; position: number } | undefined
  for (const target of targets) {
    const targetAnchors = anchors(target)
    for (const movingX of moving.x) for (const targetX of targetAnchors.x) {
      const distance = targetX - movingX
      if (Math.abs(distance) <= threshold && (!bestX || Math.abs(distance) < Math.abs(bestX.distance))) {
        bestX = { distance, target, position: targetX }
      }
    }
    for (const movingY of moving.y) for (const targetY of targetAnchors.y) {
      const distance = targetY - movingY
      if (Math.abs(distance) <= threshold && (!bestY || Math.abs(distance) < Math.abs(bestY.distance))) {
        bestY = { distance, target, position: targetY }
      }
    }
  }
  const snapped = { ...rectangle, x: rectangle.x + (bestX?.distance ?? 0), y: rectangle.y + (bestY?.distance ?? 0) }
  const guides: SnapGuide[] = []
  if (bestX) guides.push({ axis: 'x', position: bestX.position,
    start: Math.min(snapped.y, bestX.target.y), end: Math.max(snapped.y + snapped.height, bestX.target.y + bestX.target.height) })
  if (bestY) guides.push({ axis: 'y', position: bestY.position,
    start: Math.min(snapped.x, bestY.target.x), end: Math.max(snapped.x + snapped.width, bestY.target.x + bestY.target.width) })
  return { rectangle: snapped, guides }
}
