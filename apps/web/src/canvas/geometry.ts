import type { Point, Rectangle, ResizeHandle } from './types'

export const HANDLE_SIZE = 10
export const MIN_RECTANGLE_SIZE = 24
export const MIN_CANVAS_CONTROL_ZOOM = 0.15
export type RadiusCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'

export function containsPoint(rectangle: Rectangle, point: Point) {
  return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height
}

export function getHandlePoints(rectangle: Rectangle): Record<ResizeHandle, Point> {
  const centerX = rectangle.x + rectangle.width / 2
  const centerY = rectangle.y + rectangle.height / 2
  const right = rectangle.x + rectangle.width
  const bottom = rectangle.y + rectangle.height
  return {
    'north-west': { x: rectangle.x, y: rectangle.y }, north: { x: centerX, y: rectangle.y },
    'north-east': { x: right, y: rectangle.y }, east: { x: right, y: centerY },
    'south-east': { x: right, y: bottom }, south: { x: centerX, y: bottom },
    'south-west': { x: rectangle.x, y: bottom }, west: { x: rectangle.x, y: centerY },
  }
}

export function getHandleAtPoint(rectangle: Rectangle, point: Point, zoom = 1, cornersOnly = false) {
  const hitArea = (HANDLE_SIZE + 4) / zoom
  const localPoint = unrotatePoint(rectangle, point)
  return (Object.entries(getHandlePoints(rectangle)) as [ResizeHandle, Point][])
    .filter(([handle]) => !cornersOnly || handle.includes('-')).find(
    ([, handle]) => Math.abs(localPoint.x - handle.x) <= hitArea / 2
      && Math.abs(localPoint.y - handle.y) <= hitArea / 2,
  )?.[0]
}

function unrotatePoint(rectangle: Rectangle & { rotation?: number }, point: Point) {
  const radians = -((rectangle.rotation ?? 0) * Math.PI) / 180
  if (!radians) return point
  const centerX = rectangle.x + rectangle.width / 2
  const centerY = rectangle.y + rectangle.height / 2
  const x = point.x - centerX
  const y = point.y - centerY
  return {
    x: centerX + x * Math.cos(radians) - y * Math.sin(radians),
    y: centerY + x * Math.sin(radians) + y * Math.cos(radians),
  }
}

export function resizeRectangle(initial: Rectangle, handle: ResizeHandle, delta: Point, lockAspectRatio = false): Rectangle {
  let left = initial.x
  let top = initial.y
  let right = initial.x + initial.width
  let bottom = initial.y + initial.height
  if (handle.includes('west')) left = Math.min(left + delta.x, right - MIN_RECTANGLE_SIZE)
  if (handle.includes('east')) right = Math.max(right + delta.x, left + MIN_RECTANGLE_SIZE)
  if (handle.includes('north')) top = Math.min(top + delta.y, bottom - MIN_RECTANGLE_SIZE)
  if (handle.includes('south')) bottom = Math.max(bottom + delta.y, top + MIN_RECTANGLE_SIZE)
  if (!lockAspectRatio || initial.width <= 0 || initial.height <= 0) {
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  const freeWidth = right - left
  const freeHeight = bottom - top
  const changesWidth = handle.includes('west') || handle.includes('east')
  const changesHeight = handle.includes('north') || handle.includes('south')
  const widthScale = freeWidth / initial.width
  const heightScale = freeHeight / initial.height
  const scale = Math.max(
    MIN_RECTANGLE_SIZE / initial.width,
    MIN_RECTANGLE_SIZE / initial.height,
    changesWidth && changesHeight
      ? (Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale)
      : changesWidth ? widthScale : heightScale,
  )
  const width = initial.width * scale
  const height = initial.height * scale
  const centerX = initial.x + initial.width / 2
  const centerY = initial.y + initial.height / 2
  const x = handle.includes('west') ? initial.x + initial.width - width
    : handle.includes('east') ? initial.x : centerX - width / 2
  const y = handle.includes('north') ? initial.y + initial.height - height
    : handle.includes('south') ? initial.y : centerY - height / 2
  return { x, y, width, height }
}

export function getRadiusHandlePoints(rectangle: Rectangle & { radius?: number }): Record<RadiusCorner, Point> {
  const minimumInset = 12
  const maximumRadius = Math.min(rectangle.width, rectangle.height) / 2
  const inset = Math.min(maximumRadius, Math.max(minimumInset, rectangle.radius ?? 0))
  return {
    'top-left': { x: rectangle.x + inset, y: rectangle.y + inset },
    'top-right': { x: rectangle.x + rectangle.width - inset, y: rectangle.y + inset },
    'bottom-right': { x: rectangle.x + rectangle.width - inset, y: rectangle.y + rectangle.height - inset },
    'bottom-left': { x: rectangle.x + inset, y: rectangle.y + rectangle.height - inset },
  }
}

export function getRadiusHandleAtPoint(rectangle: Rectangle & { radius?: number }, point: Point, zoom = 1) {
  const localPoint = unrotatePoint(rectangle, point)
  return (Object.entries(getRadiusHandlePoints(rectangle)) as [RadiusCorner, Point][]).find(([, handle]) =>
    Math.hypot(localPoint.x - handle.x, localPoint.y - handle.y) <= 8 / zoom)?.[0]
}
