import type { CanvasElement, CanvasLayer, Point } from './types'

type ElementLocation = { layerIndex: number; elementIndex: number }
type LayerIndex = { locations: Map<string, ElementLocation> }
const layerIndexes = new WeakMap<CanvasLayer[], LayerIndex>()

function indexLayers(layers: CanvasLayer[]) {
  const cached = layerIndexes.get(layers)
  if (cached) return cached
  const locations = new Map<string, ElementLocation>()
  layers.forEach((layer, layerIndex) => layer.elements.forEach((element, elementIndex) => {
    locations.set(element.id, { layerIndex, elementIndex })
  }))
  const index = { locations }
  layerIndexes.set(layers, index)
  return index
}

function elementAt(layers: CanvasLayer[], id: string | null) {
  if (!id) return undefined
  const location = indexLayers(layers).locations.get(id)
  if (!location) return undefined
  return layers[location.layerIndex]?.elements[location.elementIndex]
}

export function visibleElements(layers: CanvasLayer[]) {
  return layers.flatMap((layer) => layer.visible ? hierarchicalElements(layer.elements, false) : [])
}

export function interactiveElements(layers: CanvasLayer[]) {
  return layers.flatMap((layer) => layer.visible && !layer.locked
    ? hierarchicalElements(layer.elements, true)
    : [])
}

function hierarchicalElements(elements: CanvasElement[], interactive: boolean) {
  const result: CanvasElement[] = []
  const visited = new Set<string>()
  const elementIds = new Set(elements.map((element) => element.id))
  const childrenByParent = new Map<string, CanvasElement[]>()
  for (const element of elements) {
    if (!element.parentId) continue
    const children = childrenByParent.get(element.parentId) ?? []
    children.push(element)
    childrenByParent.set(element.parentId, children)
  }
  const visit = (element: CanvasElement) => {
    if (visited.has(element.id) || !element.visible || (interactive && element.locked)) return
    visited.add(element.id)
    result.push(element)
    childrenByParent.get(element.id)?.forEach(visit)
  }
  elements.filter((element) => !element.parentId || !elementIds.has(element.parentId)).forEach(visit)
  return result
}

export function cleanSelection(elements: CanvasElement[], ids: string[]) {
  if (ids.length <= 1) return ids
  const selected = new Set(ids)
  const byId = new Map(elements.map((element) => [element.id, element]))
  return ids.filter((id) => {
    const visited = new Set<string>()
    let parentId = byId.get(id)?.parentId
    while (parentId && !visited.has(parentId)) {
      if (selected.has(parentId)) return false
      visited.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
    return true
  })
}

export function isElementLocked(layers: CanvasLayer[], id: string) {
  const location = indexLayers(layers).locations.get(id)
  const layer = location ? layers[location.layerIndex] : undefined
  const element = location ? layer?.elements[location.elementIndex] : undefined
  let parent = element?.parentId ? elementAt(layers, element.parentId) : undefined
  while (parent) {
    if (parent.locked) return true
    parent = parent.parentId ? elementAt(layers, parent.parentId) : undefined
  }
  return Boolean(layer?.locked || element?.locked)
}

export function findTopElementAtPoint(layers: CanvasLayer[], point: Point) {
  const elements = interactiveElements(layers)
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (containsElementPoint(element, point)) return element
  }
  return undefined
}

export function findTopFrameLabelAtPoint(layers: CanvasLayer[], point: Point) {
  const elements = interactiveElements(layers)
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element.type !== 'frame' && !element.component && !element.instanceOf || element.parentId) continue
    const width = Math.max(36, element.name.length * 7 + 8)
    if (point.x >= element.x && point.x <= element.x + width
      && point.y >= element.y - 20 && point.y <= element.y) return element
  }
  return undefined
}

export function containsElementPoint(element: CanvasElement, point: Point) {
  const rotation = -(('rotation' in element ? element.rotation ?? 0 : 0) * Math.PI) / 180
  const centerX = element.x + element.width / 2
  const centerY = element.y + element.height / 2
  const offsetX = point.x - centerX
  const offsetY = point.y - centerY
  const localX = offsetX * Math.cos(rotation) - offsetY * Math.sin(rotation)
  const localY = offsetX * Math.sin(rotation) + offsetY * Math.cos(rotation)
  if (element.type === 'circle') {
    return (localX / (element.width / 2)) ** 2 + (localY / (element.height / 2)) ** 2 <= 1
  }
  const x = localX + element.width / 2
  const y = localY + element.height / 2
  if (x < 0 || x > element.width || y < 0 || y > element.height) return false
  if ((element.type !== 'rectangle' && element.type !== 'frame') || !(element.radius ?? 0)) return true
  const radius = Math.min(element.radius ?? 0, element.width / 2, element.height / 2)
  if (x >= radius && x <= element.width - radius || y >= radius && y <= element.height - radius) return true
  const cornerX = x < radius ? radius : element.width - radius
  const cornerY = y < radius ? radius : element.height - radius
  return Math.hypot(x - cornerX, y - cornerY) <= radius
}

export function updateElement(
  layers: CanvasLayer[],
  id: string,
  update: (element: CanvasElement) => CanvasElement,
) {
  const index = indexLayers(layers)
  const location = index.locations.get(id)
  if (!location) return layers
  const layer = layers[location.layerIndex]
  const current = layer.elements[location.elementIndex]
  const updated = update(current)
  if (updated === current) return layers
  const elements = [...layer.elements]
  elements[location.elementIndex] = updated
  const next = [...layers]
  next[location.layerIndex] = { ...layer, elements }
  if (updated.id === id) layerIndexes.set(next, index)
  return next
}

export function moveLayer(layers: CanvasLayer[], id: string, toIndex: number) {
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  if (fromIndex < 0) return layers
  const next = [...layers]
  const [layer] = next.splice(fromIndex, 1)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, layer)
  return next
}

export function findElement(layers: CanvasLayer[], id: string | null) {
  return elementAt(layers, id)
}

export function getElementsBounds(elements: CanvasElement[]) {
  if (!elements.length) return null
  const left = Math.min(...elements.map((element) => element.x))
  const top = Math.min(...elements.map((element) => element.y))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  const bottom = Math.max(...elements.map((element) => element.y + element.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
