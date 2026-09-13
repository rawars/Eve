import type { AiEditResponse } from '@eve/contracts'
import type { CanvasDocument, CanvasElement, FrameElement } from './types'

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function commonElement(value: Record<string, unknown>) {
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && value.name.length > 0
    && finite(value.x) && finite(value.y) && finite(value.width) && Number(value.width) > 0
    && finite(value.height) && Number(value.height) > 0
    && typeof value.visible === 'boolean'
    && (value.parentId === undefined || typeof value.parentId === 'string')
}

export function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (!commonElement(item)) return false
  if (item.type === 'rectangle') return typeof item.fill === 'string'
  if (item.type === 'circle') return typeof item.fill === 'string'
  if (item.type === 'image') return typeof item.src === 'string'
  if (item.type === 'text') return typeof item.text === 'string' && typeof item.fill === 'string'
    && typeof item.fontFamily === 'string' && finite(item.fontSize) && finite(item.fontWeight)
    && finite(item.lineHeight) && finite(item.letterSpacing)
    && ['left', 'center', 'right'].includes(String(item.textAlign))
    && ['top', 'middle', 'bottom'].includes(String(item.verticalAlign))
  if (item.type === 'frame') return typeof item.fill === 'string' && typeof item.clipContent === 'boolean'
    && ['none', 'horizontal', 'vertical', 'grid'].includes(String(item.layoutMode))
    && finite(item.gap) && finite(item.padding)
    && ['start', 'center', 'end'].includes(String(item.alignX))
    && ['start', 'center', 'end'].includes(String(item.alignY))
  return false
}

function descendantIds(elements: CanvasElement[], rootId: string) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const element of elements) {
      if (element.parentId && ids.has(element.parentId) && !ids.has(element.id)) { ids.add(element.id); changed = true }
    }
  }
  return ids
}

export function aiContext(document: CanvasDocument, targetId: string) {
  const elements = document.layers.flatMap((layer) => layer.elements)
  const ids = descendantIds(elements, targetId)
  return {
    targetId,
    elements: elements.filter((element) => ids.has(element.id)),
    variableCollections: document.variableCollections ?? [],
    variableModes: document.variableModes ?? {},
  }
}

export function applyAiStructure(document: CanvasDocument, targetId: string, result: AiEditResponse) {
  const sourceLayer = document.layers.find((layer) => layer.elements.some((element) => element.id === targetId))
  const target = sourceLayer?.elements.find((element) => element.id === targetId)
  if (!sourceLayer || target?.type !== 'frame') throw new Error('The AI target is no longer an editable container.')
  if (!result.elements.length || result.elements.length > 250 || !result.elements.every(isCanvasElement)) {
    throw new Error('The AI returned invalid canvas elements.')
  }
  const replacement = result.elements.map((element) => ({ ...element }))
  const ids = new Set(replacement.map((element) => element.id))
  if (ids.size !== replacement.length) throw new Error('The AI returned duplicate element IDs.')
  const root = replacement.find((element) => element.id === targetId)
  if (root?.type !== 'frame' || root.parentId !== target.parentId) throw new Error('The AI changed the selected container identity.')

  const currentElements = document.layers.flatMap((layer) => layer.elements)
  const replacedIds = descendantIds(currentElements, targetId)
  const outsideIds = new Set(currentElements.filter((element) => !replacedIds.has(element.id)).map((element) => element.id))
  if (replacement.some((element) => outsideIds.has(element.id))) throw new Error('The AI reused an existing element ID.')
  for (const element of replacement) {
    if (element.id === targetId) continue
    if (!element.parentId || !ids.has(element.parentId)) throw new Error('The AI returned an element outside the selected container.')
    const visited = new Set<string>()
    let parentId: string | undefined = element.parentId
    while (parentId && parentId !== targetId) {
      if (visited.has(parentId)) throw new Error('The AI returned a cyclic hierarchy.')
      visited.add(parentId)
      parentId = replacement.find((candidate) => candidate.id === parentId)?.parentId
    }
    if (parentId !== targetId) throw new Error('The AI returned a disconnected hierarchy.')
  }

  const insertionIndex = sourceLayer.elements.findIndex((element) => element.id === targetId)
  const remaining = sourceLayer.elements.filter((element) => !replacedIds.has(element.id))
  remaining.splice(insertionIndex, 0, ...replacement)
  return { ...document, activeElementId: targetId, selectedElementIds: [targetId],
    layers: document.layers.map((layer) => layer.id === sourceLayer.id ? { ...layer, elements: remaining } : layer) }
}

export function aiHistoryLabel(instruction: string) {
  const compact = instruction.trim().replace(/\s+/g, ' ')
  return `AI · ${compact.slice(0, 64)}${compact.length > 64 ? '…' : ''}`
}

export function isAiTarget(element: CanvasElement | undefined): element is FrameElement {
  return element?.type === 'frame' && !element.locked
}
