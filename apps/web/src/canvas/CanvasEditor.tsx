import { IconPlus } from '@tabler/icons-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import selectCursorUrl from '../assets/cursors/black.svg?url'
import crosshairCursorUrl from '../assets/cursors/crosshair.svg?url'
import radiusCursorUrl from '../assets/cursors/edit-radius.svg?url'
import handCursorUrl from '../assets/cursors/hand-new.svg?url'
import handPressedCursorUrl from '../assets/cursors/hand-press.svg?url'
import moveCursorUrl from '../assets/cursors/move.svg?url'
import resizeEastWestCursorUrl from '../assets/cursors/resize-east-west.svg?url'
import resizeNorthEastSouthWestCursorUrl from '../assets/cursors/resize-north-east-southwest.svg?url'
import resizeNorthSouthCursorUrl from '../assets/cursors/resize-north-south.svg?url'
import resizeNorthWestSouthEastCursorUrl from '../assets/cursors/resize-north-west-south-east.svg?url'
import textCursorUrl from '../assets/cursors/text-horizontal.svg?url'
import { containsPoint, getHandleAtPoint, getRadiusHandleAtPoint, MIN_CANVAS_CONTROL_ZOOM, resizeRectangle, type RadiusCorner } from './geometry'
import { describeChange, documentContent, loadHistory, loadPersistentHistory, saveHistory, type HistoryEntry } from './history'
import type { FramePreset } from './FramePresetsPanel'
import { CanvasPropertiesPanel } from './CanvasPropertiesPanel'
import { OffscreenSelectionIndicator } from './OffscreenSelectionIndicator'
import { cleanSelection, containsElementPoint, findElement, findTopElementAtPoint, findTopFrameLabelAtPoint, getElementsBounds, interactiveElements, isElementLocked, updateElement, visibleElements } from './layers'
import { LayerPanel } from './LayerPanel'
import { measureTextHeight, measureTextWidth, renderCanvas, textOffsetAtPoint, type RenderTextDraft } from './render'
import { hydrateDocumentAssets, loadDocument, loadPersistentDocument, loadViewport, saveDocument, saveViewport } from './storage'
import { allDocumentLayers, ensurePagesDocument, syncActivePage, switchDocumentPage } from './pages'
import { snapRectangle, type SnapGuide } from './snapping'
import { SpatialIndex } from './spatialIndex'
import { buildSpatialIndex, resolveVariablesOffThread, WORKER_INDEX_THRESHOLD } from './computation'
import { CanvasTileRenderer } from './tileRenderer'
import { ToolbarPanel, type Tool } from './ToolbarPanel'
import { TypographyPanel } from './TypographyPanel'
import { blendResolvedVariableColors, ensureThemeDocument, resolveVariable, resolvedVariableDocument } from './variables'
import { RectanglePropertiesPanel, type RectangleAlignment } from './RectanglePropertiesPanel'
import type { CanvasDocument, CanvasElement, CircleElement, FrameElement, Point, RectangleElement, ResizeHandle, TextElement } from './types'

const AssetsPanel = lazy(() => import('./AssetsPanel').then((module) => ({ default: module.AssetsPanel })))
const VariablesPanel = lazy(() => import('./VariablesPanel').then((module) => ({ default: module.VariablesPanel })))
const HistoryPanel = lazy(() => import('./HistoryPanel').then((module) => ({ default: module.HistoryPanel })))
const FramePresetsPanel = lazy(() => import('./FramePresetsPanel').then((module) => ({ default: module.FramePresetsPanel })))
const panelFallback = <aside aria-label="Loading panel" className="absolute bottom-4 right-4 top-4 z-30 w-72 animate-pulse rounded-xl border border-neutral-200 bg-white/90" />

const INITIAL_RECTANGLE = { width: 240, height: 160 }
const ZOOM_SENSITIVITY = 0.006
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const VARIANT_SPACING = 72
const MIN_RADIUS_HANDLE_SCREEN_SIZE = 48
const MIN_RADIUS_HANDLE_ZOOM = 0.5
const cursor = (url: string, fallback = 'default') => `url("${url}") 16 16, ${fallback}`
const SELECT_CURSOR = cursor(selectCursorUrl)
const MOVE_CURSOR = cursor(moveCursorUrl, 'move')
const HAND_CURSOR = cursor(handCursorUrl, 'grab')
const HAND_PRESSED_CURSOR = cursor(handPressedCursorUrl, 'grabbing')
const CROSSHAIR_CURSOR = cursor(crosshairCursorUrl, 'crosshair')
const TEXT_CURSOR = cursor(textCursorUrl, 'text')
const RADIUS_CURSOR = cursor(radiusCursorUrl, 'ew-resize')
const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  north: cursor(resizeNorthSouthCursorUrl, 'ns-resize'),
  south: cursor(resizeNorthSouthCursorUrl, 'ns-resize'),
  east: cursor(resizeEastWestCursorUrl, 'ew-resize'),
  west: cursor(resizeEastWestCursorUrl, 'ew-resize'),
  'north-east': cursor(resizeNorthEastSouthWestCursorUrl, 'nesw-resize'),
  'south-west': cursor(resizeNorthEastSouthWestCursorUrl, 'nesw-resize'),
  'north-west': cursor(resizeNorthWestSouthEastCursorUrl, 'nwse-resize'),
  'south-east': cursor(resizeNorthWestSouthEastCursorUrl, 'nwse-resize'),
}

function toolCursor(tool: Tool, spacePressed = false) {
  if (spacePressed || tool === 'hand') return HAND_CURSOR
  if (tool === 'frame' || tool === 'rectangle' || tool === 'circle') return CROSSHAIR_CURSOR
  if (tool === 'text') return TEXT_CURSOR
  return SELECT_CURSOR
}

function withInstanceOverrides<T extends CanvasElement>(element: T, keys: string[]): T {
  if (!element.instanceOf && !element.componentSourceId) return element
  return { ...element, overrides: [...new Set([...(element.overrides ?? []), ...keys])] }
}

function bindElementVariable(document: CanvasDocument, element: CanvasElement, property: string, variableId?: string, resolvedElement = element) {
  const currentVariableId = element.variableBindings?.[property]
  const resolved = !variableId && currentVariableId
    ? (resolvedElement as unknown as Record<string, unknown>)[property] ?? resolveVariable(document, currentVariableId)
    : undefined
  const localValue = resolved !== undefined && typeof resolved !== 'object' ? { [property]: resolved } : {}
  return withInstanceOverrides({ ...element, ...localValue,
    variableBindings: variableId
      ? { ...(element.variableBindings ?? {}), [property]: variableId }
      : Object.fromEntries(Object.entries(element.variableBindings ?? {}).filter(([key]) => key !== property)),
  } as CanvasElement, ['variableBindings', ...(Object.keys(localValue))])
}

const COMMON_STYLE_KEYS = ['opacity', 'effects'] as const
const TEXT_STYLE_KEYS = ['fill', 'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'textAlign', 'verticalAlign'] as const

function copyElementStyle(element: CanvasElement) {
  const keys: string[] = [...COMMON_STYLE_KEYS]
  if ('fill' in element) keys.push('fill')
  if (element.type === 'rectangle' || element.type === 'frame') keys.push('radius')
  if (element.type === 'text') keys.push(...TEXT_STYLE_KEYS)
  return Object.fromEntries(keys.filter((key) => key in element)
    .map((key) => [key, structuredClone((element as unknown as Record<string, unknown>)[key])]))
}

function pasteElementStyle(element: CanvasElement, style: Record<string, unknown>) {
  const compatible = new Set<string>(COMMON_STYLE_KEYS)
  if ('fill' in element) compatible.add('fill')
  if (element.type === 'rectangle' || element.type === 'frame') compatible.add('radius')
  if (element.type === 'text') TEXT_STYLE_KEYS.forEach((key) => compatible.add(key))
  const entries = Object.entries(style).filter(([key]) => compatible.has(key))
  return withInstanceOverrides({ ...element, ...Object.fromEntries(entries) } as CanvasElement, entries.map(([key]) => key))
}
type Interaction =
  | { kind: 'drag'; origin: Point; initialElements: CanvasElement[]; subjectIds: string[]; wasSelected?: boolean; layoutFrameId?: string; dropFrameId?: string | null; detachedFromFrame?: boolean }
  | { kind: 'resize'; elementId: string; origin: Point; initial: CanvasElement; handle: ResizeHandle }
  | { kind: 'radius'; elementId: string; origin: Point; initial: RectangleElement | FrameElement; corner: RadiusCorner }
  | { kind: 'padding'; elementId: string; origin: Point; initial: FrameElement; side: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'create'; elementId: string; origin: Point }
  | { kind: 'text-select'; anchorOffset: number }
  | { kind: 'marquee'; origin: Point; initialSelectedIds?: string[] }
  | { kind: 'pan'; origin: Point; initialViewport: Point }

function pointerPosition(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const bounds = canvas.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function framePaddingHandleAtPoint(frame: FrameElement, point: Point, zoom: number) {
  if (frame.layoutMode === 'none') return undefined
  const padding = Math.max(0, frame.padding)
  const tolerance = 7 / zoom
  const handles = {
    top: { x: frame.x + frame.width / 2, y: frame.y + padding },
    right: { x: frame.x + frame.width - padding, y: frame.y + frame.height / 2 },
    bottom: { x: frame.x + frame.width / 2, y: frame.y + frame.height - padding },
    left: { x: frame.x + padding, y: frame.y + frame.height / 2 },
  } as const
  return (Object.entries(handles) as ['top' | 'right' | 'bottom' | 'left', Point][])
    .find(([, handle]) => Math.abs(point.x - handle.x) <= tolerance && Math.abs(point.y - handle.y) <= tolerance)?.[0]
}

function frameAcceptsRectangle(frame: FrameElement, rectangle: { x: number; y: number; width: number; height: number }, pointer: Point) {
  const overlapWidth = Math.max(0, Math.min(frame.x + frame.width, rectangle.x + rectangle.width) - Math.max(frame.x, rectangle.x))
  const overlapHeight = Math.max(0, Math.min(frame.y + frame.height, rectangle.y + rectangle.height) - Math.max(frame.y, rectangle.y))
  const overlapRatio = overlapWidth * overlapHeight / Math.max(1, rectangle.width * rectangle.height)
  const center = { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 }
  return containsElementPoint(frame, pointer) || containsElementPoint(frame, center) || overlapRatio >= 0.2
}

function constrainFrameResize(frame: FrameElement, rectangle: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle, lockAspectRatio: boolean) {
  const minWidth = Math.max(1, frame.minWidth ?? 1)
  const minHeight = Math.max(1, frame.minHeight ?? 1)
  const maxWidth = Math.max(minWidth, frame.maxWidth ?? Number.POSITIVE_INFINITY)
  const maxHeight = Math.max(minHeight, frame.maxHeight ?? Number.POSITIVE_INFINITY)
  let width: number
  let height: number
  if (lockAspectRatio && frame.width > 0 && frame.height > 0) {
    const requestedScale = rectangle.width / frame.width
    const minimumScale = Math.max(minWidth / frame.width, minHeight / frame.height)
    const maximumScale = Math.min(maxWidth / frame.width, maxHeight / frame.height)
    const scale = Math.max(minimumScale, Math.min(maximumScale, requestedScale))
    width = frame.width * scale
    height = frame.height * scale
  } else {
    width = Math.max(minWidth, Math.min(maxWidth, rectangle.width))
    height = Math.max(minHeight, Math.min(maxHeight, rectangle.height))
  }
  const centerX = frame.x + frame.width / 2
  const centerY = frame.y + frame.height / 2
  const x = handle.includes('west') ? frame.x + frame.width - width
    : handle.includes('east') ? frame.x : centerX - width / 2
  const y = handle.includes('north') ? frame.y + frame.height - height
    : handle.includes('south') ? frame.y : centerY - height / 2
  return { x, y, width, height }
}

function withDescendants(elements: CanvasElement[], element: CanvasElement) {
  const result: CanvasElement[] = [element]
  for (const child of elements.filter((candidate) => candidate.parentId === element.id)) {
    result.push(...withDescendants(elements, child))
  }
  return result
}

function selectionWithDescendants(elements: CanvasElement[], selectedIds: Iterable<string>) {
  const selected = new Set(selectedIds)
  for (const id of [...selected]) {
    const element = elements.find((candidate) => candidate.id === id)
    if (element) withDescendants(elements, element).forEach((descendant) => selected.add(descendant.id))
  }
  return selected
}

function selectedIdsInArea(layers: CanvasDocument['layers'], selection: { x: number; y: number; width: number; height: number },
  initialSelectedIds: string[] | undefined, tolerance: number, candidates?: CanvasElement[]) {
  const selected = (candidates ?? interactiveElements(layers)).filter((element) =>
    element.x >= selection.x - tolerance && element.y >= selection.y - tolerance
    && element.x + element.width <= selection.x + selection.width + tolerance
    && element.y + element.height <= selection.y + selection.height + tolerance)
  const ids = initialSelectedIds
    ? [...new Set([...initialSelectedIds, ...selected.map((element) => element.id)])]
    : selected.map((element) => element.id)
  return cleanSelection(layers.flatMap((layer) => layer.elements), ids)
}

function isInsideAutoLayout(elements: CanvasElement[], element?: CanvasElement) {
  let parent = element?.parentId ? elements.find((candidate) => candidate.id === element.parentId) : undefined
  const visited = new Set<string>()
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id)
    if (parent.type === 'frame' && parent.layoutMode !== 'none') return true
    parent = parent.parentId ? elements.find((candidate) => candidate.id === parent?.parentId) : undefined
  }
  return false
}

function createInstanceTree(elements: CanvasElement[], component: CanvasElement, nextId: () => string, position?: Point) {
  const sourceTree = withDescendants(elements, component)
  const ids = new Map(sourceTree.map((element) => [element.id, nextId()]))
  const componentSet = component.variantSetId
    ? elements.find((element): element is FrameElement => element.id === component.variantSetId && element.type === 'frame')
    : undefined
  const rootX = componentSet ? componentSet.x + componentSet.width + 40 : component.x + 24
  const rootY = componentSet ? componentSet.y : component.y + 24
  const offset = position
    ? { x: position.x - component.width / 2 - component.x, y: position.y - component.height / 2 - component.y }
    : { x: rootX - component.x, y: rootY - component.y }
  return sourceTree.map((element, index): CanvasElement => ({ ...structuredClone(element),
    id: ids.get(element.id)!, name: index === 0 ? `${component.name} instance` : element.name,
    x: element.x + offset.x, y: element.y + offset.y,
    parentId: index === 0 ? position ? undefined : componentSet?.parentId ?? component.parentId : element.parentId ? ids.get(element.parentId) : undefined,
    component: false,
    ...(index === 0 ? { instanceOf: component.id } : { componentSourceId: element.id }),
  }))
}

function cloneComponentTree(elements: CanvasElement[], component: CanvasElement, nextId: () => string, offset: Point) {
  const sourceTree = withDescendants(elements, component)
  const ids = new Map(sourceTree.map((element) => [element.id, nextId()]))
  return sourceTree.map((element, index): CanvasElement => ({ ...structuredClone(element), id: ids.get(element.id)!,
    name: index === 0 ? `${component.name} variant` : element.name, x: element.x + offset.x, y: element.y + offset.y,
    parentId: index === 0 ? component.parentId : element.parentId ? ids.get(element.parentId) : undefined,
    component: index === 0, instanceOf: undefined, componentSourceId: undefined, overrides: [],
  }))
}

function applyFrameLayouts(elements: CanvasElement[]) {
  let next = elements
  const frameDepth = (frame: FrameElement) => {
    let depth = 0
    let parent = frame.parentId ? elements.find((element) => element.id === frame.parentId) : undefined
    const visited = new Set([frame.id])
    while (parent?.type === 'frame' && !visited.has(parent.id)) {
      visited.add(parent.id); depth += 1
      parent = parent.parentId ? elements.find((element) => element.id === parent?.parentId) : undefined
    }
    return depth
  }
  const translateTree = (items: CanvasElement[], id: string, x: number, y: number) => {
    const root = items.find((element) => element.id === id)
    if (!root || root.x === x && root.y === y) return items
    const moved = new Set([id])
    let found = true
    while (found) {
      found = false
      for (const element of items) if (element.parentId && moved.has(element.parentId) && !moved.has(element.id)) {
        moved.add(element.id); found = true
      }
    }
    const deltaX = x - root.x
    const deltaY = y - root.y
    return items.map((element) => moved.has(element.id)
      ? { ...element, x: element.x + deltaX, y: element.y + deltaY } : element)
  }
  const frames = elements.filter((element): element is FrameElement => element.type === 'frame')
    .sort((first, second) => frameDepth(second) - frameDepth(first))
  for (const originalFrame of frames) {
    const frame = next.find((element): element is FrameElement => element.id === originalFrame.id && element.type === 'frame')
    if (!frame) continue
    if (frame.layoutMode === 'none') continue
    let children = next.filter((element) => element.parentId === frame.id)
    const gap = Math.max(0, frame.gap)
    const padding = Math.max(0, frame.padding)
    const constrain = (value: number, minimum?: number, maximum?: number) =>
      Math.max(minimum ?? 1, Math.min(maximum ?? Number.POSITIVE_INFINITY, value))
    const alignedX = (childWidth: number, frameWidth = frame.width) => frame.alignX === 'center' ? frame.x + (frameWidth - childWidth) / 2
      : frame.alignX === 'end' ? frame.x + frameWidth - padding - childWidth : frame.x + padding
    const alignedY = (childHeight: number, frameHeight = frame.height) => frame.alignY === 'center' ? frame.y + (frameHeight - childHeight) / 2
      : frame.alignY === 'end' ? frame.y + frameHeight - padding - childHeight : frame.y + padding
    if (!children.length) continue
    if (frame.layoutMode === 'horizontal') {
      const fixedGapWidth = Math.max(0, children.length - 1) * (frame.autoGap ? 0 : gap)
      const fillWidthChildren = frame.fixedWidth !== false ? children.filter((child) => child.fillWidth) : []
      const fillWidth = fillWidthChildren.length
        ? Math.max(1, (frame.width - padding * 2 - fixedGapWidth
          - children.filter((child) => !child.fillWidth).reduce((total, child) => total + child.width, 0)) / fillWidthChildren.length)
        : 0
      const fillHeight = Math.max(1, frame.height - padding * 2)
      next = next.map((element) => {
        if (element.parentId !== frame.id) return element
        const width = element.fillWidth && fillWidthChildren.length ? fillWidth : element.width
        const height = element.fillHeight && frame.fixedHeight !== false ? fillHeight : element.height
        return width === element.width && height === element.height ? element : { ...element, width, height }
      })
      children = next.filter((element) => element.parentId === frame.id)
      const childrenWidth = children.reduce((total, child) => total + child.width, 0)
      const contentWidth = childrenWidth + Math.max(0, children.length - 1) * (frame.autoGap ? 0 : gap)
      const naturalWidth = Math.max(1, contentWidth + padding * 2)
      const naturalHeight = Math.max(1, ...children.map((child) => child.height + padding * 2))
      const width = constrain(frame.fixedWidth ? frame.width : naturalWidth, frame.minWidth, frame.maxWidth)
      const height = constrain(frame.fixedHeight ? frame.height : naturalHeight, frame.minHeight, frame.maxHeight)
      const resolvedGap = frame.autoGap && children.length > 1
        ? Math.max(0, (width - padding * 2 - childrenWidth) / (children.length - 1)) : gap
      const layoutWidth = childrenWidth + Math.max(0, children.length - 1) * resolvedGap
      next = next.map((element) => element.id === frame.id
        ? element.width === width && element.height === height ? element : { ...element, width, height }
        : element)
      let x = frame.alignX === 'center' ? frame.x + (width - layoutWidth) / 2
        : frame.alignX === 'end' ? frame.x + width - padding - layoutWidth : frame.x + padding
      for (const child of children) {
        const current = next.find((element) => element.id === child.id) ?? child
        const nextY = alignedY(current.height, height)
        next = translateTree(next, current.id, x, nextY)
        x += current.width + resolvedGap
      }
    } else if (frame.layoutMode === 'vertical') {
      const fixedGapHeight = Math.max(0, children.length - 1) * (frame.autoGap ? 0 : gap)
      const fillHeightChildren = frame.fixedHeight !== false ? children.filter((child) => child.fillHeight) : []
      const fillHeight = fillHeightChildren.length
        ? Math.max(1, (frame.height - padding * 2 - fixedGapHeight
          - children.filter((child) => !child.fillHeight).reduce((total, child) => total + child.height, 0)) / fillHeightChildren.length)
        : 0
      const fillWidth = Math.max(1, frame.width - padding * 2)
      next = next.map((element) => {
        if (element.parentId !== frame.id) return element
        const width = element.fillWidth && frame.fixedWidth !== false ? fillWidth : element.width
        const height = element.fillHeight && fillHeightChildren.length ? fillHeight : element.height
        return width === element.width && height === element.height ? element : { ...element, width, height }
      })
      children = next.filter((element) => element.parentId === frame.id)
      const childrenHeight = children.reduce((total, child) => total + child.height, 0)
      const contentHeight = childrenHeight + Math.max(0, children.length - 1) * (frame.autoGap ? 0 : gap)
      const naturalHeight = Math.max(1, contentHeight + padding * 2)
      const naturalWidth = Math.max(1, ...children.map((child) => child.width + padding * 2))
      const width = constrain(frame.fixedWidth ? frame.width : naturalWidth, frame.minWidth, frame.maxWidth)
      const height = constrain(frame.fixedHeight ? frame.height : naturalHeight, frame.minHeight, frame.maxHeight)
      const resolvedGap = frame.autoGap && children.length > 1
        ? Math.max(0, (height - padding * 2 - childrenHeight) / (children.length - 1)) : gap
      const layoutHeight = childrenHeight + Math.max(0, children.length - 1) * resolvedGap
      next = next.map((element) => element.id === frame.id
        ? element.width === width && element.height === height ? element : { ...element, width, height }
        : element)
      let y = frame.alignY === 'center' ? frame.y + (height - layoutHeight) / 2
        : frame.alignY === 'end' ? frame.y + height - padding - layoutHeight : frame.y + padding
      for (const child of children) {
        const current = next.find((element) => element.id === child.id) ?? child
        const nextX = alignedX(current.width, width)
        next = translateTree(next, current.id, nextX, y)
        y += current.height + resolvedGap
      }
    } else {
      const columns = Math.max(1, Math.ceil(Math.sqrt(children.length)))
      const columnWidth = Math.max(0, ...children.map((child) => child.width))
      const rowHeight = Math.max(0, ...children.map((child) => child.height))
      const rows = Math.ceil(children.length / columns)
      const gridWidth = columns * columnWidth + Math.max(0, columns - 1) * gap
      const gridHeight = rows * rowHeight + Math.max(0, rows - 1) * gap
      const naturalWidth = gridWidth + padding * 2
      const naturalHeight = gridHeight + padding * 2
      const width = constrain(frame.fixedWidth ? frame.width : naturalWidth, frame.minWidth, frame.maxWidth)
      const height = constrain(frame.fixedHeight ? frame.height : naturalHeight, frame.minHeight, frame.maxHeight)
      next = next.map((element) => element.id === frame.id
        ? element.width === width && element.height === height ? element : { ...element, width, height }
        : element)
      children.forEach((child, index) => {
        const current = next.find((element) => element.id === child.id) ?? child
        const gridX = frame.alignX === 'center' ? frame.x + (width - gridWidth) / 2
          : frame.alignX === 'end' ? frame.x + width - padding - gridWidth : frame.x + padding
        const gridY = frame.alignY === 'center' ? frame.y + (height - gridHeight) / 2
          : frame.alignY === 'end' ? frame.y + height - padding - gridHeight : frame.y + padding
        const nextX = gridX + (index % columns) * (columnWidth + gap)
          + (frame.alignX === 'center' ? (columnWidth - current.width) / 2 : frame.alignX === 'end' ? columnWidth - current.width : 0)
        const nextY = gridY + Math.floor(index / columns) * (rowHeight + gap)
          + (frame.alignY === 'center' ? (rowHeight - current.height) / 2 : frame.alignY === 'end' ? rowHeight - current.height : 0)
        next = translateTree(next, current.id, nextX, nextY)
      })
    }
  }
  return next
}

export function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const initializedRef = useRef(false)
  const interactionRef = useRef<Interaction | null>(null)
  const clipboardRef = useRef<{ layerId: string; element: CanvasElement }[]>([])
  const styleClipboardRef = useRef<Record<string, unknown> | null>(null)
  const internalPastePendingRef = useRef(false)
  const redoStackRef = useRef<CanvasDocument[]>([])
  const tileRendererRef = useRef(new CanvasTileRenderer())
  const suppressHistoryRef = useRef(false)
  const persistentDocumentRef = useRef<CanvasDocument | null>(null)
  const persistentDocumentCheckedRef = useRef(false)
  const [document, setDocumentState] = useState<CanvasDocument>({ layers: [], activeElementId: null, selectedElementIds: [], background: '#E0E0E0' })
  const boundVariableCount = useMemo(() => document.layers.reduce((count, layer) => count
    + layer.elements.reduce((total, element) => total + Object.keys(element.variableBindings ?? {}).length, 0), 0), [document.layers])
  const immediateResolvedLayers = useMemo(() => boundVariableCount < WORKER_INDEX_THRESHOLD
    ? resolvedVariableDocument(document).layers : null,
  [boundVariableCount, document.layers, document.variableCollections, document.variableModes])
  const [deferredResolvedLayers, setDeferredResolvedLayers] = useState<CanvasDocument['layers'] | null>(null)
  useEffect(() => {
    if (immediateResolvedLayers) return
    let active = true
    void resolveVariablesOffThread(document).then((patches) => {
      if (!active) return
      if (!patches) { setDeferredResolvedLayers(resolvedVariableDocument(document).layers); return }
      setDeferredResolvedLayers(document.layers.map((layer) => ({ ...layer, elements: layer.elements.map((element) => {
        const patch = patches.get(element.id)
        return patch ? { ...element, ...patch } as CanvasElement : element
      }) })))
    })
    return () => { active = false }
  }, [document.layers, document.variableCollections, document.variableModes, immediateResolvedLayers])
  const resolvedLayers = immediateResolvedLayers ?? deferredResolvedLayers ?? document.layers
  const resolvedDocument = useMemo(() => ({ ...document, layers: resolvedLayers }), [document, resolvedLayers])
  const sceneElements = useMemo(() => visibleElements(resolvedDocument.layers), [resolvedDocument.layers])
  const sceneElementsById = useMemo(() => new Map(sceneElements.map((element) => [element.id, element])), [sceneElements])
  const interactiveSceneElements = useMemo(() => interactiveElements(resolvedDocument.layers), [resolvedDocument.layers])
  const interactiveIds = useMemo(() => new Set(interactiveSceneElements.map((element) => element.id)), [interactiveSceneElements])
  const immediateSpatialIndex = useMemo(() => sceneElements.length < WORKER_INDEX_THRESHOLD
    ? new SpatialIndex(sceneElements) : null, [sceneElements])
  const [deferredSpatialIndex, setDeferredSpatialIndex] = useState(() => new SpatialIndex([]))
  useEffect(() => {
    if (immediateSpatialIndex) return
    let active = true
    void buildSpatialIndex(sceneElements).then((index) => { if (active) setDeferredSpatialIndex(index) })
    return () => { active = false }
  }, [immediateSpatialIndex, sceneElements])
  const spatialIndex = immediateSpatialIndex ?? deferredSpatialIndex
  const setDocument = useCallback((update: SetStateAction<CanvasDocument>) => setDocumentState((current) => {
    const next = typeof update === 'function' ? update(current) : update
    return syncActivePage(next)
  }), [])
  const [documentLoaded, setDocumentLoaded] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, pixelRatio: 1 })
  const [imageRevision, setImageRevision] = useState(0)
  const [marquee, setMarquee] = useState<RectangleElement | null>(null)
  const [viewport, setViewport] = useState(() => {
    const stored = loadViewport()
    return { ...stored, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, stored.zoom)) }
  })
  const [spacePressed, setSpacePressed] = useState(false)
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [radiusEditingId, setRadiusEditingId] = useState<string | null>(null)
  const [radiusHoverId, setRadiusHoverId] = useState<string | null>(null)
  const [paddingEditingId, setPaddingEditingId] = useState<string | null>(null)
  const [paddingHover, setPaddingHover] = useState<{ id: string; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null)
  const [frameNameDraft, setFrameNameDraft] = useState<{ elementId: string; value: string; left: number; top: number; width: number } | null>(null)
  const [textDraft, setTextDraft] = useState<(RenderTextDraft & { screenX: number; screenY: number; originalText?: string }) | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [historyReady, setHistoryReady] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [modeTransition, setModeTransition] = useState<{ from: CanvasDocument; progress: number } | null>(null)
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null)
  const nextElementId = useRef(2)
  const renderElements = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return []
    const margin = 100 / viewport.zoom
    const viewportRectangle = {
      x: -viewport.x / viewport.zoom - margin,
      y: -viewport.y / viewport.zoom - margin,
      width: canvasSize.width / viewport.zoom + margin * 2,
      height: canvasSize.height / viewport.zoom + margin * 2,
    }
    const visible = spatialIndex.query(viewportRectangle)
    const ids = new Set(visible.map((element) => element.id))
    for (const element of visible) {
      let parentId = element.parentId
      while (parentId) {
        ids.add(parentId)
        parentId = sceneElementsById.get(parentId)?.parentId
      }
    }
    return spatialIndex.ordered(ids)
  }, [canvasSize.height, canvasSize.width, sceneElementsById, spatialIndex, viewport])

  function editableTextElement(context: CanvasRenderingContext2D): TextElement | null {
    if (!textDraft) return null
    const width = textDraft.autoWidth === false ? (textDraft.width ?? 1)
      : Math.max(1, measureTextWidth(context, textDraft))
    return { ...textDraft, id: textDraft.elementId ?? 'draft', name: textDraft.text,
      type: 'text', fill: '#171717', visible: true, width,
      height: textDraft.height ?? textDraft.fontSize * textDraft.lineHeight,
      verticalAlign: textDraft.verticalAlign ?? 'top' }
  }

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const pixelRatio = window.devicePixelRatio || 1
    const width = Math.round(bounds.width * pixelRatio)
    const height = Math.round(bounds.height * pixelRatio)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const context = canvas.getContext('2d')
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    setCanvasSize((current) => current.width === bounds.width && current.height === bounds.height
      && current.pixelRatio === pixelRatio ? current : { width: bounds.width, height: bounds.height, pixelRatio })
    if (!initializedRef.current) {
      initializedRef.current = true
      if (!persistentDocumentCheckedRef.current && typeof indexedDB !== 'undefined') {
        persistentDocumentCheckedRef.current = true
        void loadPersistentDocument().then((persistent) => {
          persistentDocumentRef.current = persistent
          initializedRef.current = false
          window.dispatchEvent(new Event('resize'))
        })
        return
      }
      persistentDocumentCheckedRef.current = true
      const stored = persistentDocumentRef.current ?? loadDocument()
      persistentDocumentRef.current = null
      const variableCollections = stored?.variableCollections?.map((collection) => {
        if (collection.modes.length !== 1) return collection
        const originalMode = collection.modes[0]
        const darkMode = { id: `${collection.id}-dark`, name: 'Dark' }
        return { ...collection, modes: [{ ...originalMode, name: originalMode.name === 'Default' || originalMode.name === 'Mode 1' ? 'Light' : originalMode.name }, darkMode],
          variables: collection.variables.map((variable) => ({ ...variable, values: { ...variable.values,
            [darkMode.id]: variable.values[originalMode.id] } })) }
      })
      const normalized = stored && context ? { ...stored, variableCollections, background: stored.background ?? '#E0E0E0', layers: stored.layers.map((layer) => ({ ...layer,
        elements: layer.elements.map((element) => {
          if (element.type === 'rectangle') return { ...element, radius: Number.isFinite(element.radius) ? element.radius : 0,
            rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
            opacity: Number.isFinite(element.opacity) ? element.opacity : 1, effects: element.effects ?? [] }
          if (element.type === 'circle') return { ...element, rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
            opacity: Number.isFinite(element.opacity) ? element.opacity : 1, effects: element.effects ?? [] }
          if (element.type === 'frame') return { ...element, radius: Number.isFinite(element.radius) ? element.radius : 0,
            rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
            opacity: Number.isFinite(element.opacity) ? element.opacity : 1, effects: element.effects ?? [],
            clipContent: element.clipContent !== false, layoutMode: element.layoutMode ?? 'horizontal',
            gap: Number.isFinite(element.gap) ? element.gap : 10,
            padding: Number.isFinite(element.padding) ? element.padding : 10,
            alignX: element.alignX ?? 'start', alignY: element.alignY ?? 'start' }
          if (element.type === 'image') return { ...element, opacity: Number.isFinite(element.opacity) ? element.opacity : 1 }
          const migrated = { ...element, text: element.text ?? element.name, fontFamily: element.fontFamily ?? 'Inter',
            fontWeight: element.fontWeight ?? 600, fontSize: element.fontSize ?? 24,
            lineHeight: element.lineHeight ?? 1.2, letterSpacing: element.letterSpacing ?? 0,
            textAlign: element.textAlign ?? 'left', verticalAlign: element.verticalAlign ?? 'top',
            autoHeight: element.autoHeight ?? true }
          if (migrated.autoWidth !== false) {
            const width = measureTextWidth(context, migrated)
            return { ...migrated, width, height: Math.max(migrated.height, measureTextHeight(context, migrated, width)) }
          }
          return { ...migrated, height: Math.max(migrated.height, measureTextHeight(context, migrated)) }
        }) })) } : stored
      setDocument(ensurePagesDocument(ensureThemeDocument(normalized ?? {
        activeElementId: 'rectangle-1',
        selectedElementIds: ['rectangle-1'],
        background: '#E0E0E0',
        layers: [{ id: 'layer-1', name: 'Main layer', expanded: true, visible: true, locked: false, elements: [
          { id: 'rectangle-1', name: 'Rectangle', type: 'rectangle', fill: '#D9D9D9', visible: true, locked: false,
            radius: 0, rotation: 0, opacity: 1, effects: [],
            x: (bounds.width - INITIAL_RECTANGLE.width) / 2,
            y: (bounds.height - INITIAL_RECTANGLE.height) / 2, ...INITIAL_RECTANGLE },
        ] }],
      })))
      setDocumentLoaded(true)
    }
  }, [])

  useEffect(() => {
    resizeCanvas()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeCanvas)
    if (canvasRef.current) observer?.observe(canvasRef.current)
    window.addEventListener('resize', resizeCanvas)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [resizeCanvas])

  useEffect(() => {
    if (documentLoaded) saveDocument(document)
  }, [document, documentLoaded])

  useEffect(() => saveViewport(viewport), [viewport])

  useEffect(() => {
    let active = true
    void loadPersistentHistory().then((persistent) => {
      if (!active) return
      setHistory((current) => {
        const currentNewest = current.at(-1)?.createdAt ?? 0
        const persistentNewest = persistent.at(-1)?.createdAt ?? 0
        return persistent.length && persistentNewest >= currentNewest ? persistent.slice(-50) : current
      })
      setHistoryReady(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!initializedRef.current || !historyReady) return
    if (suppressHistoryRef.current) { suppressHistoryRef.current = false; return }
    const timer = window.setTimeout(() => {
      setHistory((current) => {
        const previous = current.at(-1)
        if (previous && documentContent(previous.document) === documentContent(document)) return current
        const entry: HistoryEntry = {
          id: crypto.randomUUID(), createdAt: Date.now(),
          label: describeChange(previous?.document, document), document,
        }
        const next = [...current, entry].slice(-50)
        redoStackRef.current = []
        saveHistory(next)
        return next
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [document, historyReady])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (previewEntry) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)) return
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
        && (event.code === 'KeyA' || event.key.toLowerCase() === 'a')) {
        const selected = document.selectedElementIds.length === 1
          ? findElement(document.layers, document.selectedElementIds[0]) : undefined
        if (selected?.type !== 'text' || isElementLocked(document.layers, selected.id)) return
        event.preventDefault()
        setDocument((current) => {
          const layer = current.layers.find((candidate) => candidate.elements.some((element) => element.id === selected.id))
          const text = layer?.elements.find((element): element is TextElement => element.id === selected.id && element.type === 'text')
          if (!layer || !text) return current
          const padding = 10
          const id = `frame-${Date.now()}-${nextElementId.current++}`
          const frame: FrameElement = { id, name: 'Frame', type: 'frame', x: text.x - padding, y: text.y - padding,
            width: text.width + padding * 2, height: text.height + padding * 2, fill: 'rgba(0,0,0,0)', visible: true,
            locked: false, radius: 0, rotation: 0, opacity: 1, effects: [], clipContent: false,
            layoutMode: 'horizontal', gap: 10, padding, alignX: 'start', alignY: 'start', fixedWidth: false,
            fixedHeight: false, parentId: text.parentId }
          const index = layer.elements.findIndex((element) => element.id === text.id)
          const elements = [...layer.elements]
          elements.splice(index, 0, frame)
          elements[index + 1] = { ...text, parentId: id }
          return { ...current, activeElementId: id, selectedElementIds: [id], layers: current.layers.map((candidate) =>
            candidate.id === layer.id ? { ...candidate, elements: applyFrameLayouts(elements) } : candidate) }
        })
        setActiveTool('select')
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && ['t', 'r', 'o', 'f'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        const key = event.key.toLowerCase()
        setActiveTool(key === 't' ? 'text' : key === 'r' ? 'rectangle' : key === 'o' ? 'circle' : 'frame')
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.altKey
        && (event.code === 'KeyK' || event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        const selectedIds = new Set(document.selectedElementIds.filter((id) => !isElementLocked(document.layers, id)))
        if (!selectedIds.size) return
        setDocument((current) => {
          if (selectedIds.size === 1) {
            const id = [...selectedIds][0]
            return { ...current, activeElementId: id, selectedElementIds: [id],
              layers: updateElement(current.layers, id, (element) => ({ ...element, component: true })) }
          }
          const layer = current.layers.find((candidate) => candidate.elements.some((element) => selectedIds.has(element.id)))
          if (!layer) return current
          const resolvedLayer = resolvedVariableDocument(current).layers.find((candidate) => candidate.id === layer.id)
          const selected = (resolvedLayer?.elements ?? layer.elements).filter((element) => selectedIds.has(element.id))
          const bounds = getElementsBounds(selected)
          if (!bounds) return current
          const id = `component-${Date.now()}-${nextElementId.current++}`
          const parentIds = new Set(selected.map((element) => element.parentId))
          const parentId = parentIds.size === 1 ? selected[0].parentId : undefined
          const component: FrameElement = { id, name: 'Component', type: 'frame', component: true,
            ...bounds, fill: 'rgba(0,0,0,0)', visible: true, locked: false, radius: 0, rotation: 0,
            opacity: 1, effects: [], clipContent: false, layoutMode: 'none', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start', fixedWidth: true, fixedHeight: true, parentId }
          return { ...current, activeElementId: id, selectedElementIds: [id], layers: current.layers.map((candidate) =>
            candidate.id === layer.id ? { ...candidate, elements: [component, ...candidate.elements.map((element) =>
              selectedIds.has(element.id) && element.parentId === parentId ? { ...element, parentId: id } : element)] } : candidate) }
        })
        return
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const selected = document.selectedElementIds.length === 1
          ? findElement(document.layers, document.selectedElementIds[0]) : undefined
        if (!selected || (!selected.component && !selected.instanceOf)) return
        setDocument((current) => {
          const layer = current.layers.find((candidate) => candidate.elements.some((element) => element.id === selected.id))
          if (!layer) return current
          const main = selected.component ? selected : findElement(current.layers, selected.instanceOf ?? '')
          if (!main) return current
          const copies = createInstanceTree(layer.elements, main,
            () => `instance-${Date.now()}-${nextElementId.current++}`)
          const root = copies[0]
          return { ...current, activeElementId: root.id, selectedElementIds: [root.id],
            layers: current.layers.map((candidate) => candidate.id === layer.id
              ? { ...candidate, elements: [...candidate.elements, ...copies] } : candidate) }
        })
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          const restored = redoStackRef.current.pop()
          if (!restored) return
          const currentEntry: HistoryEntry = { id: crypto.randomUUID(), createdAt: Date.now(),
            label: 'Undo point', document }
          const nextHistory = [...history, currentEntry].slice(-50)
          saveHistory(nextHistory); setHistory(nextHistory)
          suppressHistoryRef.current = true
          setDocument(restored)
          return
        }
        const currentMatchesLatest = history.at(-1)
          && documentContent(history.at(-1)!.document) === documentContent(document)
        const targetIndex = history.length - (currentMatchesLatest ? 2 : 1)
        if (targetIndex < 0) return
        redoStackRef.current.push(document)
        const nextHistory = history.slice(0, targetIndex + 1)
        saveHistory(nextHistory); setHistory(nextHistory)
        suppressHistoryRef.current = true
        setDocument(history[targetIndex].document)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        const selected = document.selectedElementIds.length === 1
          ? findElement(document.layers, document.selectedElementIds[0]) : undefined
        if (!selected) return
        event.preventDefault()
        styleClipboardRef.current = copyElementStyle(selected)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        if (!styleClipboardRef.current) return
        event.preventDefault()
        const selected = new Set(document.selectedElementIds.filter((id) => !isElementLocked(document.layers, id)))
        setDocument((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer,
          elements: layer.elements.map((element) => selected.has(element.id)
            ? pasteElementStyle(element, styleClipboardRef.current!) : element) })) }))
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        const selected = new Set(document.selectedElementIds)
        clipboardRef.current = document.layers.flatMap((layer) => layer.elements
          .filter((element) => selected.has(element.id)).map((element) => ({ layerId: layer.id, element: structuredClone(element) })))
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        const selected = selectionWithDescendants(document.layers.flatMap((layer) => layer.elements),
          document.selectedElementIds.filter((id) => !isElementLocked(document.layers, id)))
        clipboardRef.current = document.layers.flatMap((layer) => layer.elements
          .filter((element) => selected.has(element.id)).map((element) => ({ layerId: layer.id, element: structuredClone(element) })))
        setDocument((current) => ({ ...current, activeElementId: null, selectedElementIds: [],
          layers: current.layers.map((layer) => ({ ...layer,
            elements: layer.elements.filter((element) => !selected.has(element.id)) })) }))
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        event.preventDefault()
        internalPastePendingRef.current = true
        window.setTimeout(() => { internalPastePendingRef.current = false }, 0)
        setDocument((current) => {
          const pastedIds: string[] = []
          const targetLayer = [...current.layers].reverse().find((layer) => !layer.locked)
          if (!targetLayer) return current
          const copies: CanvasElement[] = []
          for (const item of clipboardRef.current) {
            const id = `${item.element.type}-${Date.now()}-${nextElementId.current++}`
            pastedIds.push(id)
            const copy = { ...structuredClone(item.element), id, name: `${item.element.name} copy`,
              x: item.element.x + 20, y: item.element.y + 20 }
            copies.push(copy)
          }
          return { ...current, activeElementId: pastedIds.at(-1) ?? null, selectedElementIds: pastedIds,
            layers: current.layers.map((layer) => layer.id === targetLayer.id
              ? { ...layer, elements: [...layer.elements, ...copies] } : layer) }
        })
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && ['h', 'l'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        const togglesVisibility = event.key.toLowerCase() === 'h'
        const selected = new Set(document.selectedElementIds)
        setDocument((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer,
          elements: layer.elements.map((element) => selected.has(element.id)
            ? togglesVisibility ? { ...element, visible: !element.visible } : { ...element, locked: !element.locked }
            : element) })) }))
        return
      }
      if (event.key === ']' || event.key === '[') {
        event.preventDefault()
        const selected = new Set(document.selectedElementIds)
        const front = event.key === ']'
        setDocument((current) => ({ ...current, layers: current.layers.map((layer) => {
          const moved = layer.elements.filter((element) => selected.has(element.id))
          const remaining = layer.elements.filter((element) => !selected.has(element.id))
          return { ...layer, elements: front ? [...remaining, ...moved] : [...moved, ...remaining] }
        }) }))
        return
      }
      if (event.key === 'Escape') setContextMenu(null)
      if ((event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault()
        setDocument((current) => {
          const selected = selectionWithDescendants(current.layers.flatMap((layer) => layer.elements),
            current.selectedElementIds.filter((id) => !isElementLocked(current.layers, id)))
          return { ...current, activeElementId: null, selectedElementIds: [],
            layers: current.layers.map((layer) => ({ ...layer,
              elements: layer.elements.filter((element) => !selected.has(element.id)) })) }
        })
        return
      }
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        setSpacePressed(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    const reset = () => { setSpacePressed(false); clipboardRef.current = [] }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', reset)
    }
  }, [document, previewEntry])

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[role="menu"][aria-label="Element actions"]')) {
        setContextMenu(null)
      }
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (internalPastePendingRef.current) { internalPastePendingRef.current = false; return }
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      event.preventDefault()
      void insertImageFiles(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [viewport])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (event: WheelEvent) => {
      // Keep horizontal Magic Mouse gestures inside the editor instead of
      // letting the browser interpret them as back/forward navigation.
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight
          : 1
      if (!event.metaKey && !event.ctrlKey) {
        if (activeTool === 'hand' || activeTool === 'select') {
          setViewport((current) => ({ ...current,
            x: current.x - event.deltaX * unit,
            y: current.y - event.deltaY * unit }))
        }
        return
      }

      const point = pointerPosition(canvas, event)
      const delta = Math.max(-100, Math.min(100, event.deltaY * unit))

      setViewport((current) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
          current.zoom * Math.exp(-delta * ZOOM_SENSITIVITY)))
        return {
          zoom,
          x: point.x - ((point.x - current.x) * zoom) / current.zoom,
          y: point.y - ((point.y - current.y) * zoom) / current.zoom,
        }
      })
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [activeTool])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const targetDocument = previewEntry ? resolvedVariableDocument(previewEntry.document) : resolvedDocument
    const renderedDocument = modeTransition
      ? blendResolvedVariableColors(modeTransition.from, targetDocument, modeTransition.progress) : targetDocument
    if (canvas && context) {
      const onImageLoad = () => setImageRevision((current) => current + 1)
      const canUseTiles = !previewEntry && !modeTransition
      const tiled = canUseTiles && tileRendererRef.current.render(context, renderedDocument,
        canvas.clientWidth, canvas.clientHeight, canvasSize.pixelRatio, viewport, spatialIndex, sceneElements,
        textDraft ?? undefined, imageRevision, onImageLoad)
      renderCanvas(context, renderedDocument, canvas.clientWidth, canvas.clientHeight, viewport, marquee,
        textDraft ?? undefined, radiusEditingId, dropTargetFrameId, onImageLoad, frameNameDraft?.elementId,
        paddingEditingId, snapGuides, paddingHover, radiusHoverId, renderElements, sceneElements, tiled ? 'overlays' : 'all')
    }
  }, [canvasSize, document, dropTargetFrameId, frameNameDraft?.elementId, imageRevision, marquee, modeTransition, paddingEditingId, paddingHover, previewEntry, radiusEditingId, radiusHoverId, renderElements, sceneElements, snapGuides, spatialIndex, textDraft, viewport])

  useEffect(() => {
    if (!modeTransition || modeTransition.progress >= 1) return
    const startedAt = performance.now() - modeTransition.progress * 180
    let frame = 0
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 180)
      setModeTransition((current) => current ? { ...current, progress } : null)
      if (progress < 1) frame = requestAnimationFrame(animate)
      else setModeTransition(null)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [modeTransition?.from])

  useEffect(() => {
    setDocument((current) => {
      let changed = false
      const layers = current.layers.map((layer) => {
        let elements = applyFrameLayouts(layer.elements)
        const context = canvasRef.current?.getContext('2d')
        if (context) {
          elements = elements.map((element) => {
            if (element.type !== 'text' || element.autoHeight === false || element.fillHeight) return element
            const height = measureTextHeight(context, element, element.width)
            return height === element.height ? element : { ...element, height }
          })
          elements = applyFrameLayouts(elements)
        }
        const layerChanged = elements.some((element, index) => element !== layer.elements[index])
        if (!layerChanged) return layer
        changed = true
        return { ...layer, elements }
      })
      return changed ? { ...current, layers } : current
    })
  }, [document.layers])

  useEffect(() => {
    setDocument((current) => {
      let changed = false
      const all = current.layers.flatMap((layer) => layer.elements)
      const allSources = allDocumentLayers(current).flatMap((layer) => layer.elements)
      const layers = current.layers.map((layer) => ({ ...layer, elements: layer.elements.map((element) => {
        let source: CanvasElement | undefined
        let root = element
        while (root.parentId) {
          const parent = all.find((candidate) => candidate.id === root.parentId)
          if (!parent) break
          root = parent
        }
        if (element.instanceOf) source = allSources.find((candidate) => candidate.id === element.instanceOf && candidate.component)
        else if (element.componentSourceId && root.instanceOf) source = allSources.find((candidate) => candidate.id === element.componentSourceId)
        if (!source) return element
        const mainRoot = root.instanceOf ? allSources.find((candidate) => candidate.id === root.instanceOf) : undefined
        const offset = mainRoot ? { x: root.x - mainRoot.x, y: root.y - mainRoot.y } : { x: 0, y: 0 }
        const parent = element.parentId ? all.find((candidate) => candidate.id === element.parentId) : undefined
        const positionedByLayout = parent?.type === 'frame' && parent.layoutMode !== 'none'
        const { id: _id, name: _name, x: _x, y: _y, parentId: _parentId,
          component: _component, instanceOf: _instanceOf, componentSourceId: _componentSourceId,
          overrides: _overrides, ...sourceValues } = source
        const synced = { ...sourceValues } as Record<string, unknown>
        for (const key of element.overrides ?? []) delete synced[key]
        const next = { ...element, ...synced,
          x: element.instanceOf || positionedByLayout || element.overrides?.includes('x') ? element.x : source.x + offset.x,
          y: element.instanceOf || positionedByLayout || element.overrides?.includes('y') ? element.y : source.y + offset.y }
        if (JSON.stringify(next) !== JSON.stringify(element)) changed = true
        return next
      }) }))
      return changed ? { ...current, layers } : current
    })
  }, [document.layers])

  useEffect(() => {
    if (!textDraft || !textInputRef.current) return
    const offset = textDraft.cursorOffset ?? textDraft.text.length
    textInputRef.current.focus({ preventScroll: true })
    textInputRef.current.setSelectionRange(offset, offset)
  }, [Boolean(textDraft), textDraft?.elementId])

  useEffect(() => {
    if (!frameNameDraft) return
    const frame = findElement(resolvedDocument.layers, frameNameDraft.elementId)
    if (frame?.type !== 'frame') { setFrameNameDraft(null); return }
    const left = viewport.x + frame.x * viewport.zoom
    const top = viewport.y + (frame.y - 18) * viewport.zoom
    const width = Math.max(48 * viewport.zoom, (frameNameDraft.value.length * 7 + 12) * viewport.zoom)
    if (frameNameDraft.left !== left || frameNameDraft.top !== top || frameNameDraft.width !== width) {
      setFrameNameDraft((current) => current ? { ...current, left, top, width } : current)
    }
  }, [document.layers, frameNameDraft, viewport])

  useEffect(() => {
    const cancel = () => cancelInteraction()
    const resetWhenInactive = () => {
      setSpacePressed(false)
      cancel()
    }
    const cancelWhenHidden = () => { if (window.document.visibilityState === 'hidden') resetWhenInactive() }
    window.addEventListener('blur', resetWhenInactive)
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    window.document.addEventListener('visibilitychange', cancelWhenHidden)
    return () => {
      window.removeEventListener('blur', resetWhenInactive)
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
      window.document.removeEventListener('visibilitychange', cancelWhenHidden)
    }
  }, [activeTool, spacePressed])

  function cancelInteraction() {
    const interaction = interactionRef.current
    if (!interaction && !marquee && !radiusEditingId && !paddingEditingId
      && !paddingHover && !dropTargetFrameId && !snapGuides.length) return
    if (interaction?.kind === 'create') setActiveTool('select')
    interactionRef.current = null
    setMarquee(null)
    setRadiusEditingId(null)
    setPaddingEditingId(null)
    setPaddingHover(null)
    setDropTargetFrameId(null)
    setSnapGuides([])
    if (canvasRef.current) canvasRef.current.style.cursor = toolCursor(activeTool, spacePressed)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (previewEntry || event.button !== 0) return
    setContextMenu(null)
    setDropTargetFrameId(null)
    const point = pointerPosition(event.currentTarget, event)
    const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
    const interactionLayers = resolvedDocument.layers
    if (textDraft) {
      const context = event.currentTarget.getContext('2d')
      const draftElement = context ? editableTextElement(context) : null
      if (!draftElement) return
      if (!containsPoint(draftElement, documentPoint)) {
        event.preventDefault()
        const target = findTopElementAtPoint(interactionLayers, documentPoint)
        commitText()
        setDocument((current) => ({ ...current,
          activeElementId: target?.id ?? null,
          selectedElementIds: target ? [target.id] : [] }))
        return
      }
      if (context) {
        // Keep the hidden text input focused. Without preventing the canvas'
        // default pointer action, the browser blurs it and commits the edit
        // before a drag selection can begin.
        event.preventDefault()
        const cursorOffset = textOffsetAtPoint(context, draftElement, documentPoint)
        setTextDraft((current) => current ? { ...current, cursorOffset, selectionStart: cursorOffset, selectionEnd: cursorOffset } : current)
        textInputRef.current?.focus()
        textInputRef.current?.setSelectionRange(cursorOffset, cursorOffset)
        interactionRef.current = { kind: 'text-select', anchorOffset: cursorOffset }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      return
    }
    if (spacePressed || activeTool === 'hand') {
      interactionRef.current = { kind: 'pan', origin: point, initialViewport: viewport }
      event.currentTarget.style.cursor = HAND_PRESSED_CURSOR
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    if (activeTool === 'text') {
      const targetLayerIndex = document.layers.findIndex((layer) => !layer.locked)
      if (targetLayerIndex < 0) return
      setDocument((current) => ({ ...current, activeElementId: null, selectedElementIds: [] }))
      setTextDraft({ x: documentPoint.x, y: documentPoint.y,
        screenX: point.x, screenY: point.y, text: '', fontFamily: 'Inter',
        fontWeight: 600, fontSize: 24, lineHeight: 1.2, letterSpacing: 0, textAlign: 'left',
        verticalAlign: 'top', autoWidth: true, cursorOffset: 0, selectionStart: 0, selectionEnd: 0 })
      event.preventDefault()
      return
    }
    if (activeTool === 'frame' || activeTool === 'rectangle' || activeTool === 'circle') {
      const targetLayerIndex = document.layers.findIndex((layer) => !layer.locked)
      if (targetLayerIndex < 0) return
      const count = nextElementId.current++
      const elementId = `${activeTool}-${Date.now()}-${count}`
      const shapeName = activeTool === 'circle' ? 'Circle' : activeTool === 'frame' ? 'Frame' : 'Rectangle'
      const common = { id: elementId, name: `${shapeName} ${count}`,
        fill: activeTool === 'frame' ? '#FFFFFF' : '#D9D9D9', visible: true, locked: false, rotation: 0, opacity: 1, effects: [],
        x: documentPoint.x, y: documentPoint.y, width: 1, height: 1 }
      const element: RectangleElement | CircleElement | FrameElement = activeTool === 'circle'
        ? { ...common, type: 'circle' } : activeTool === 'frame'
          ? { ...common, type: 'frame', radius: 0, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' }
          : { ...common, type: 'rectangle', radius: 0 }
      setDocument((current) => ({ ...current, activeElementId: elementId,
        selectedElementIds: [elementId],
        layers: current.layers.map((layer, index) => index === targetLayerIndex ? { ...layer, elements: [...layer.elements, element] } : layer) }))
      interactionRef.current = { kind: 'create', elementId, origin: documentPoint }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    const selectedElements = interactiveElements(interactionLayers)
      .filter((element) => document.selectedElementIds.includes(element.id))
    const selectedBounds = getElementsBounds(selectedElements)
    const additiveSelection = event.shiftKey || event.metaKey || event.ctrlKey
    if (!additiveSelection && selectedElements.length > 1 && selectedBounds
      && documentPoint.x >= selectedBounds.x && documentPoint.x <= selectedBounds.x + selectedBounds.width
      && documentPoint.y >= selectedBounds.y && documentPoint.y <= selectedBounds.y + selectedBounds.height) {
      interactionRef.current = { kind: 'drag', origin: documentPoint, initialElements: selectedElements,
        subjectIds: selectedElements.map((element) => element.id) }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    const activeElement = document.activeElementId && !isElementLocked(interactionLayers, document.activeElementId)
      ? findElement(interactionLayers, document.activeElementId) : undefined
    const activeManagedByLayout = activeElement?.type === 'text'
      && isInsideAutoLayout(interactionLayers.flatMap((layer) => layer.elements), activeElement)
    const radiusHandlesVisible = (activeElement?.type === 'rectangle' || activeElement?.type === 'frame')
      && viewport.zoom >= MIN_RADIUS_HANDLE_ZOOM
      && Math.min(activeElement.width, activeElement.height) * viewport.zoom >= MIN_RADIUS_HANDLE_SCREEN_SIZE
      && containsElementPoint(activeElement, documentPoint)
    const radiusHandle = radiusHandlesVisible
      ? getRadiusHandleAtPoint(activeElement, documentPoint, viewport.zoom) : undefined
    const paddingHandle = activeElement?.type === 'frame'
      ? framePaddingHandleAtPoint(activeElement, documentPoint, viewport.zoom) : undefined
    const activeHandle = activeElement && !activeManagedByLayout && viewport.zoom >= MIN_CANVAS_CONTROL_ZOOM
      ? getHandleAtPoint(activeElement, documentPoint, viewport.zoom, true) : undefined
    const pointCandidates = spatialIndex.query({ x: documentPoint.x, y: documentPoint.y, width: 0, height: 0 })
      .filter((element) => interactiveIds.has(element.id))
    const target = radiusHandle || paddingHandle || activeHandle ? activeElement
      : findTopFrameLabelAtPoint(interactionLayers, documentPoint)
        ?? [...pointCandidates].reverse().find((element) => containsElementPoint(element, documentPoint))
    if (!target) {
      interactionRef.current = { kind: 'marquee', origin: documentPoint,
        initialSelectedIds: additiveSelection ? document.selectedElementIds : undefined }
      setMarquee({ id: 'marquee', name: 'Selection', type: 'rectangle', fill: '', visible: true,
        x: documentPoint.x, y: documentPoint.y, width: 0, height: 0 })
      if (!additiveSelection) setDocument((current) => ({ ...current, activeElementId: null, selectedElementIds: [] }))
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    if (additiveSelection && !radiusHandle && !paddingHandle && !activeHandle) {
      setDocument((current) => {
        const selected = current.selectedElementIds.includes(target.id)
          ? current.selectedElementIds.filter((id) => id !== target.id)
          : [...current.selectedElementIds, target.id]
        const cleaned = cleanSelection(current.layers.flatMap((layer) => layer.elements), selected)
        return { ...current, activeElementId: cleaned.at(-1) ?? null, selectedElementIds: cleaned }
      })
      return
    }
    setDocument((current) => ({ ...current, activeElementId: target.id, selectedElementIds: [target.id] }))
    interactionRef.current = radiusHandle && (target.type === 'rectangle' || target.type === 'frame')
      ? { kind: 'radius', elementId: target.id, origin: documentPoint, initial: target, corner: radiusHandle }
      : paddingHandle && target.type === 'frame'
        ? { kind: 'padding', elementId: target.id, origin: documentPoint, initial: target, side: paddingHandle }
      : activeHandle
      ? { kind: 'resize', elementId: target.id, origin: documentPoint, initial: target, handle: activeHandle }
      : { kind: 'drag', origin: documentPoint, initialElements: target.type === 'frame'
        ? withDescendants(interactionLayers.flatMap((layer) => layer.elements), target) : [target],
        subjectIds: [target.id], wasSelected: document.selectedElementIds.includes(target.id),
        layoutFrameId: target.parentId && (() => {
          const parent = findElement(interactionLayers, target.parentId)
          return parent?.type === 'frame' && parent.layoutMode !== 'none' ? parent.id : undefined
        })() }
    setRadiusEditingId(radiusHandle && (target.type === 'rectangle' || target.type === 'frame') ? target.id : null)
    setPaddingEditingId(paddingHandle && target.type === 'frame' ? target.id : null)
    setPaddingHover(paddingHandle && target.type === 'frame' ? { id: target.id, side: paddingHandle } : null)
    event.currentTarget.style.cursor = radiusHandle ? RADIUS_CURSOR
      : paddingHandle ? (paddingHandle === 'left' || paddingHandle === 'right' ? 'ew-resize' : 'ns-resize')
      : activeHandle ? RESIZE_CURSORS[activeHandle] : MOVE_CURSOR
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (previewEntry) return
    const point = pointerPosition(event.currentTarget, event)
    const interaction = interactionRef.current
    if (!interaction) {
      if (spacePressed || activeTool === 'hand') { setRadiusHoverId(null); event.currentTarget.style.cursor = HAND_CURSOR; return }
      if (activeTool === 'frame' || activeTool === 'rectangle' || activeTool === 'circle') { setRadiusHoverId(null); event.currentTarget.style.cursor = CROSSHAIR_CURSOR; return }
      if (activeTool === 'text') { setRadiusHoverId(null); event.currentTarget.style.cursor = TEXT_CURSOR; return }
      const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
      const interactionLayers = resolvedDocument.layers
      const activeElement = document.activeElementId && !isElementLocked(interactionLayers, document.activeElementId)
        ? findElement(interactionLayers, document.activeElementId) : undefined
      const activeManagedByLayout = activeElement?.type === 'text'
        && isInsideAutoLayout(interactionLayers.flatMap((layer) => layer.elements), activeElement)
      const radiusHandlesVisible = (activeElement?.type === 'rectangle' || activeElement?.type === 'frame')
        && viewport.zoom >= MIN_RADIUS_HANDLE_ZOOM
        && Math.min(activeElement.width, activeElement.height) * viewport.zoom >= MIN_RADIUS_HANDLE_SCREEN_SIZE
        && containsElementPoint(activeElement, documentPoint)
      setRadiusHoverId(radiusHandlesVisible ? activeElement.id : null)
      const radiusHandle = radiusHandlesVisible
        ? getRadiusHandleAtPoint(activeElement, documentPoint, viewport.zoom) : undefined
      const paddingHandle = activeElement?.type === 'frame'
        ? framePaddingHandleAtPoint(activeElement, documentPoint, viewport.zoom) : undefined
      setPaddingHover(paddingHandle && activeElement?.type === 'frame'
        ? { id: activeElement.id, side: paddingHandle } : null)
      const handle = activeElement && !activeManagedByLayout && viewport.zoom >= MIN_CANVAS_CONTROL_ZOOM
        ? getHandleAtPoint(activeElement, documentPoint, viewport.zoom, true) : undefined
      event.currentTarget.style.cursor = radiusHandle ? RADIUS_CURSOR
        : paddingHandle ? (paddingHandle === 'left' || paddingHandle === 'right' ? 'ew-resize' : 'ns-resize')
        : handle ? RESIZE_CURSORS[handle]
          : findTopFrameLabelAtPoint(interactionLayers, documentPoint)
            || [...spatialIndex.query({ x: documentPoint.x, y: documentPoint.y, width: 0, height: 0 })
              .filter((element) => interactiveIds.has(element.id))]
              .reverse().find((element) => containsElementPoint(element, documentPoint))
            ? MOVE_CURSOR : SELECT_CURSOR
      return
    }
    if ((event.buttons & 1) === 0) {
      cancelInteraction()
      return
    }
    if (interaction.kind === 'pan') {
      setViewport({
        x: interaction.initialViewport.x + point.x - interaction.origin.x,
        y: interaction.initialViewport.y + point.y - interaction.origin.y,
        zoom: viewport.zoom,
      })
      return
    }
    const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
    if (interaction.kind === 'text-select') {
      const context = event.currentTarget.getContext('2d')
      const draftElement = context && editableTextElement(context)
      if (!context || !draftElement) return
      const cursorOffset = textOffsetAtPoint(context, draftElement, documentPoint)
      const selectionStart = Math.min(interaction.anchorOffset, cursorOffset)
      const selectionEnd = Math.max(interaction.anchorOffset, cursorOffset)
      setTextDraft((current) => current ? { ...current, cursorOffset, selectionStart, selectionEnd } : current)
      textInputRef.current?.setSelectionRange(selectionStart, selectionEnd)
      return
    }
    if (interaction.kind === 'radius') {
      const movement = { x: documentPoint.x - interaction.origin.x, y: documentPoint.y - interaction.origin.y }
      const inward = { x: interaction.corner.includes('right') ? -movement.x : movement.x,
        y: interaction.corner.includes('bottom') ? -movement.y : movement.y }
      const delta = Math.abs(inward.x) >= Math.abs(inward.y) ? inward.x : inward.y
      const radius = Math.max(0, Math.min(Math.min(interaction.initial.width, interaction.initial.height) / 2,
        (interaction.initial.radius ?? 0) + delta))
      setDocument((current) => ({ ...current, layers: updateElement(current.layers, interaction.elementId,
        (element) => element.type === 'rectangle' || element.type === 'frame'
          ? withInstanceOverrides({ ...element, radius }, ['radius']) : element) }))
      return
    }
    if (interaction.kind === 'padding') {
      const delta = interaction.side === 'top' ? documentPoint.y - interaction.origin.y
        : interaction.side === 'bottom' ? interaction.origin.y - documentPoint.y
          : interaction.side === 'left' ? documentPoint.x - interaction.origin.x
            : interaction.origin.x - documentPoint.x
      const padding = Math.max(0, Math.min(Math.min(interaction.initial.width, interaction.initial.height) / 2,
        interaction.initial.padding + delta))
      setDocument((current) => ({ ...current, layers: updateElement(current.layers, interaction.elementId,
        (element) => element.type === 'frame'
          ? withInstanceOverrides({ ...element, padding }, ['padding']) : element) }))
      return
    }
    if (interaction.kind === 'marquee') {
      const selection = {
        x: Math.min(interaction.origin.x, documentPoint.x),
        y: Math.min(interaction.origin.y, documentPoint.y),
        width: Math.abs(documentPoint.x - interaction.origin.x),
        height: Math.abs(documentPoint.y - interaction.origin.y),
      }
      setMarquee({ id: 'marquee', name: 'Selection', type: 'rectangle', fill: '', visible: true, ...selection })
      setDocument((current) => {
        const tolerance = 1 / viewport.zoom
        const candidates = spatialIndex.query({ x: selection.x - tolerance, y: selection.y - tolerance,
          width: selection.width + tolerance * 2, height: selection.height + tolerance * 2 })
          .filter((element) => interactiveIds.has(element.id))
        const ids = selectedIdsInArea(resolvedVariableDocument(current).layers, selection,
          interaction.initialSelectedIds, tolerance, candidates)
        return { ...current, activeElementId: ids.at(-1) ?? null, selectedElementIds: ids }
      })
      return
    }
    if (interaction.kind === 'create') {
      let x = Math.min(interaction.origin.x, documentPoint.x)
      let y = Math.min(interaction.origin.y, documentPoint.y)
      let width = Math.max(1, Math.abs(documentPoint.x - interaction.origin.x))
      let height = Math.max(1, Math.abs(documentPoint.y - interaction.origin.y))
      setDocument((current) => ({ ...current, layers: updateElement(current.layers, interaction.elementId,
        (element) => {
          if (element.type === 'circle' && event.shiftKey) {
            const size = Math.max(width, height)
            width = size; height = size
            x = documentPoint.x < interaction.origin.x ? interaction.origin.x - size : interaction.origin.x
            y = documentPoint.y < interaction.origin.y ? interaction.origin.y - size : interaction.origin.y
          }
          return { ...element, x, y, width, height }
        }) }))
      return
    }
    const delta = { x: documentPoint.x - interaction.origin.x, y: documentPoint.y - interaction.origin.y }
    if (interaction.kind === 'drag') {
      if (interaction.subjectIds.length === 1) {
        const initial = interaction.initialElements.find((element) => element.id === interaction.subjectIds[0])
        if (!initial) return
        const allElements = resolvedDocument.layers.flatMap((layer) => layer.elements)
        const movedIds = new Set(interaction.initialElements.map((element) => element.id))
        const movedRectangle = { x: initial.x + delta.x, y: initial.y + delta.y,
          width: initial.width, height: initial.height }
        const hoveredFrame = [...allElements].reverse().find((element): element is FrameElement => element.type === 'frame'
          && !movedIds.has(element.id) && frameAcceptsRectangle(element, movedRectangle, documentPoint))
        interaction.dropFrameId = hoveredFrame?.id ?? null
        setDropTargetFrameId(hoveredFrame?.id ?? null)
        if (interaction.layoutFrameId) {
          const currentFrame = allElements.find((element): element is FrameElement =>
            element.id === interaction.layoutFrameId && element.type === 'frame')
          if (currentFrame && !containsElementPoint(currentFrame, documentPoint)) {
            interaction.layoutFrameId = undefined
            interaction.detachedFromFrame = true
          }
        }
        const enteredFrame = [...allElements].reverse().find((element): element is FrameElement => element.type === 'frame'
          && !movedIds.has(element.id) && element.layoutMode !== 'none'
          && frameAcceptsRectangle(element, movedRectangle, documentPoint))
        if (!interaction.layoutFrameId && enteredFrame && initial.parentId === enteredFrame.id) {
          interaction.layoutFrameId = enteredFrame.id
          interaction.detachedFromFrame = false
        }
        const layoutFrameId = interaction.layoutFrameId
        if (layoutFrameId) {
          setSnapGuides([])
          setDocument((current) => ({ ...current, layers: current.layers.map((layer) => {
            const frame = layer.elements.find((element): element is FrameElement => element.id === layoutFrameId && element.type === 'frame')
            if (!frame) return layer
            const moving = layer.elements.find((element) => element.id === initial.id)
            if (!moving) return layer
            const siblings = layer.elements.filter((element) => element.parentId === frame.id && element.id !== moving.id)
            const coordinate = frame.layoutMode === 'vertical' ? documentPoint.y : documentPoint.x
            const before = siblings.find((element) => coordinate < (frame.layoutMode === 'vertical'
              ? element.y + element.height / 2 : element.x + element.width / 2))
            const elements = layer.elements.filter((element) => element.id !== moving.id)
            const insertionIndex = before ? elements.findIndex((element) => element.id === before.id)
              : Math.max(...siblings.map((element) => elements.findIndex((item) => item.id === element.id)), elements.length - 1) + 1
            elements.splice(Math.max(0, insertionIndex), 0, { ...moving, parentId: frame.id })
            return { ...layer, elements: applyFrameLayouts(elements) }
          }) }))
          return
        }
      }
      const initialById = new Map(interaction.initialElements.map((element) => [element.id, element]))
      const initialBounds = getElementsBounds(interaction.initialElements)
      const snapTargets = resolvedDocument.layers.flatMap((layer) => layer.elements)
        .filter((element) => !initialById.has(element.id) && element.visible && !element.locked)
      const snapped = initialBounds
        ? snapRectangle({ ...initialBounds, x: initialBounds.x + delta.x, y: initialBounds.y + delta.y }, snapTargets, 5 / viewport.zoom)
        : null
      const dragDelta = snapped && initialBounds
        ? { x: snapped.rectangle.x - initialBounds.x, y: snapped.rectangle.y - initialBounds.y } : delta
      setSnapGuides(snapped?.guides ?? [])
      setDocument((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer,
        elements: applyFrameLayouts(layer.elements.map((element) => {
          const initial = initialById.get(element.id)
          return initial ? withInstanceOverrides({ ...element, x: initial.x + dragDelta.x, y: initial.y + dragDelta.y,
            ...(interaction.detachedFromFrame ? { parentId: undefined } : {}) }, ['x', 'y', ...(interaction.detachedFromFrame ? ['parentId'] : [])]) : element
        })) })) }))
    } else {
      const lockAspectRatio = event.shiftKey
      const resized = resizeRectangle(interaction.initial, interaction.handle, delta, lockAspectRatio)
      setDocument((current) => {
        const layers = updateElement(current.layers, interaction.elementId, (element) => {
          if (element.type !== 'text') {
            const constrained = element.type === 'frame'
              ? constrainFrameResize(interaction.initial as FrameElement, resized, interaction.handle, lockAspectRatio) : resized
            const changedWidth = Math.abs(constrained.width - interaction.initial.width) > 0.001
            const changedHeight = Math.abs(constrained.height - interaction.initial.height) > 0.001
            const next = withInstanceOverrides({ ...element, ...constrained,
            ...(element.type === 'frame' ? {
              fixedWidth: changedWidth ? true : element.fixedWidth,
              fixedHeight: changedHeight ? true : element.fixedHeight,
            } : {}) }, ['x', 'y', 'width', 'height', ...(element.type === 'frame' ? ['fixedWidth', 'fixedHeight'] : [])])
            return next
          }
          const changesWidth = Math.abs(resized.width - interaction.initial.width) > 0.001
          const changesHeight = Math.abs(resized.height - interaction.initial.height) > 0.001
          const sizing = {
            ...(changesWidth ? { autoWidth: false, fillWidth: false } : {}),
            ...(changesHeight ? { autoHeight: false, fillHeight: false } : {}),
          }
          if (lockAspectRatio) return withInstanceOverrides({ ...element, ...resized, ...sizing }, ['x', 'y', 'width', 'height', ...Object.keys(sizing)])
          const context = canvasRef.current?.getContext('2d')
          if (!context) return withInstanceOverrides({ ...element, ...resized, ...sizing }, ['x', 'y', 'width', 'height', ...Object.keys(sizing)])
          const contentHeight = measureTextHeight(context, element, resized.width)
          if (resized.height >= contentHeight || changesHeight) return withInstanceOverrides({ ...element, ...resized, ...sizing }, ['x', 'y', 'width', 'height', ...Object.keys(sizing)])
          const keepsBottomEdge = interaction.handle.includes('north')
          return withInstanceOverrides({ ...element, ...resized, y: keepsBottomEdge ? resized.y + resized.height - contentHeight : resized.y,
            height: contentHeight, ...sizing }, ['x', 'y', 'width', 'height', ...Object.keys(sizing)])
        })
        return { ...current, layers }
      })
    }
  }

  function finishInteraction(event: React.PointerEvent<HTMLCanvasElement>) {
    const interaction = interactionRef.current
    if (interaction?.kind === 'create') setActiveTool('select')
    if (interaction?.kind === 'marquee') {
      const point = pointerPosition(event.currentTarget, event)
      const end = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
      const selection = { x: Math.min(interaction.origin.x, end.x), y: Math.min(interaction.origin.y, end.y),
        width: Math.abs(end.x - interaction.origin.x), height: Math.abs(end.y - interaction.origin.y) }
      setDocument((current) => {
        const ids = selectedIdsInArea(resolvedVariableDocument(current).layers, selection,
          interaction.initialSelectedIds, 1 / viewport.zoom)
        return { ...current, activeElementId: ids.at(-1) ?? null, selectedElementIds: ids }
      })
      setMarquee(null)
    }
    if (interaction?.kind === 'drag' && interaction.wasSelected && interaction.initialElements.length === 1
      && interaction.initialElements[0].type === 'text') {
      const point = pointerPosition(event.currentTarget, event)
      const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
      const distance = Math.hypot(documentPoint.x - interaction.origin.x, documentPoint.y - interaction.origin.y)
      if (distance <= 3 / viewport.zoom) beginTextEditing(interaction.initialElements[0], documentPoint, point)
    }
    if (interaction?.kind === 'drag' || interaction?.kind === 'create') {
      const ids = interaction.kind === 'create' ? [interaction.elementId]
        : interaction.subjectIds
      setDocument((current) => ({ ...current, layers: current.layers.map((layer) => {
        let elements = layer.elements
        for (const frame of elements.filter((element): element is FrameElement => element.type === 'frame' && ids.includes(element.id))) {
          elements = elements.map((candidate) => candidate.id === frame.id || candidate.parentId
            || candidate.x < frame.x || candidate.y < frame.y
            || candidate.x + candidate.width > frame.x + frame.width
            || candidate.y + candidate.height > frame.y + frame.height
            ? candidate : { ...candidate, parentId: frame.id })
        }
        const frames = elements.filter((element): element is FrameElement => element.type === 'frame')
        elements = elements.map((element) => {
          if (!ids.includes(element.id)) return element
          const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
          const movingIds = interaction.kind === 'drag'
            ? new Set(interaction.initialElements.map((item) => item.id)) : new Set(ids)
          const trackedDrop = interaction.kind === 'drag' && interaction.dropFrameId !== undefined
          const parent = trackedDrop
            ? frames.find((frame) => frame.id === interaction.dropFrameId && !movingIds.has(frame.id))
            : [...frames].reverse().find((frame) => !movingIds.has(frame.id) && containsElementPoint(frame, center))
          return { ...element, parentId: parent?.id }
        })
        return { ...layer, elements: applyFrameLayouts(elements) }
      }) }))
    }
    interactionRef.current = null
    setRadiusEditingId(null)
    setPaddingEditingId(null)
    setPaddingHover(null)
    setDropTargetFrameId(null)
    setSnapGuides([])
    event.currentTarget.style.cursor = toolCursor(activeTool, spacePressed)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function confirmRollback() {
    if (!previewEntry) return
    const index = history.findIndex((entry) => entry.id === previewEntry.id)
    const nextHistory = history.slice(0, index + 1)
    const restored = structuredClone(previewEntry.document)
    restored.activeElementId = null
    restored.selectedElementIds = []
    saveHistory(nextHistory)
    setHistory(nextHistory)
    setDocument(restored)
    setPreviewEntry(null)
    setHistoryOpen(false)
  }

  function commitText() {
    if (!textDraft) return
    const text = textDraft.text.trim()
    if (text) {
      const elementId = textDraft.elementId ?? `text-${Date.now()}-${nextElementId.current++}`
      const context = canvasRef.current?.getContext('2d')
      const textStyle = { text, fontSize: textDraft.fontSize, fontFamily: textDraft.fontFamily,
        fontWeight: textDraft.fontWeight, letterSpacing: textDraft.letterSpacing }
      const element: CanvasElement = { id: elementId, name: text, type: 'text', ...textStyle,
        lineHeight: textDraft.lineHeight, textAlign: textDraft.textAlign,
        verticalAlign: textDraft.verticalAlign ?? 'top', autoWidth: textDraft.autoWidth ?? true,
        fill: '#171717', visible: true, locked: false, x: textDraft.x, y: textDraft.y,
        width: textDraft.autoWidth === false ? (textDraft.width ?? 1)
          : Math.max(1, context ? measureTextWidth(context, textStyle) : text.length * 13),
        height: textDraft.height ?? textDraft.fontSize * textDraft.lineHeight }
      setDocument((current) => {
        if (textDraft.elementId) return { ...current, activeElementId: elementId, selectedElementIds: [elementId],
          layers: updateElement(current.layers, elementId, (currentElement) => currentElement.type === 'text'
            ? withInstanceOverrides({ ...currentElement, ...element }, ['text', 'width', 'height', 'autoWidth', 'autoHeight']) : currentElement) }
        const targetLayerIndex = current.layers.findIndex((layer) => !layer.locked)
        if (targetLayerIndex < 0) return current
        return { ...current, activeElementId: elementId, selectedElementIds: [elementId],
          layers: current.layers.map((layer, index) => index === targetLayerIndex ? { ...layer, elements: [...layer.elements, element] } : layer) }
      })
    }
    setTextDraft(null)
    setActiveTool('select')
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (textDraft) {
      const selectionEnd = textDraft.text.length
      textInputRef.current?.focus()
      textInputRef.current?.setSelectionRange(0, selectionEnd)
      setTextDraft((current) => current ? { ...current, cursorOffset: selectionEnd, selectionStart: 0, selectionEnd } : current)
      return
    }
    if (activeTool !== 'select' || previewEntry) return
    const point = pointerPosition(event.currentTarget, event)
    const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
    const interactionLayers = resolvedDocument.layers
    const frame = findTopFrameLabelAtPoint(interactionLayers, documentPoint)
    if (frame) {
      setDocument((current) => ({ ...current, activeElementId: frame.id, selectedElementIds: [frame.id] }))
      setFrameNameDraft({ elementId: frame.id, value: frame.name,
        left: viewport.x + frame.x * viewport.zoom,
        top: viewport.y + (frame.y - 18) * viewport.zoom,
        width: Math.max(48 * viewport.zoom, (frame.name.length * 7 + 12) * viewport.zoom) })
      return
    }
    const target = findTopElementAtPoint(interactionLayers, documentPoint)
    if (target?.type !== 'text') return
    beginTextEditing(target, documentPoint, point)
  }

  function commitFrameName() {
    if (!frameNameDraft) return
    const name = frameNameDraft.value.trim()
    if (name) setDocument((current) => ({ ...current, layers: updateElement(current.layers, frameNameDraft.elementId,
      (element) => element.type === 'frame' ? { ...element, name } : element) }))
    setFrameNameDraft(null)
  }

  function beginTextEditing(target: TextElement, documentPoint: Point, point: Point) {
    const context = canvasRef.current?.getContext('2d')
    const cursorOffset = context ? textOffsetAtPoint(context, target, documentPoint) : target.text.length
    setTextDraft({ elementId: target.id, x: target.x, y: target.y, screenX: point.x, screenY: point.y,
      text: target.text, originalText: target.text, fontFamily: target.fontFamily, fontWeight: target.fontWeight,
      fontSize: target.fontSize, lineHeight: target.lineHeight, letterSpacing: target.letterSpacing,
      textAlign: target.textAlign, verticalAlign: target.verticalAlign, width: target.width, height: target.height,
      autoWidth: target.autoWidth, cursorOffset, selectionStart: cursorOffset, selectionEnd: cursorOffset })
    setDocument((current) => ({ ...current, activeElementId: target.id, selectedElementIds: [target.id] }))
  }

  function alignRectangle(element: RectangleElement | CircleElement | FrameElement, alignment: RectangleAlignment) {
    const canvas = canvasRef.current
    if (!canvas) return
    const visible = { x: (-viewport.x / viewport.zoom) || 0, y: (-viewport.y / viewport.zoom) || 0,
      width: canvas.clientWidth / viewport.zoom, height: canvas.clientHeight / viewport.zoom }
    const update: { x?: number; y?: number } = alignment === 'left' ? { x: visible.x }
      : alignment === 'horizontal-center' ? { x: visible.x + (visible.width - element.width) / 2 }
        : alignment === 'right' ? { x: visible.x + visible.width - element.width }
          : alignment === 'top' ? { y: visible.y }
            : alignment === 'vertical-center' ? { y: visible.y + (visible.height - element.height) / 2 }
              : { y: visible.y + visible.height - element.height }
    setDocument((current) => ({ ...current, layers: updateElement(current.layers, element.id,
      (currentElement) => currentElement.type === 'rectangle' || currentElement.type === 'circle' || currentElement.type === 'frame'
        ? { ...currentElement, ...update } : currentElement) }))
  }

  function createVariant(component: CanvasElement) {
    setDocument((current) => {
      const layer = current.layers.find((candidate) => candidate.elements.some((element) => element.id === component.id))
      if (!layer) return current
      const requested = layer.elements.find((element) => element.id === component.id)
      const live = requested?.type === 'frame' && requested.componentSet
        ? layer.elements.find((element) => element.parentId === requested.id && element.component)
        : requested
      if (!live?.component) return current
      const existingSet = live.variantSetId
        ? layer.elements.find((element): element is FrameElement => element.id === live.variantSetId && element.type === 'frame' && Boolean(element.componentSet))
        : undefined
      const setId = existingSet?.id ?? `component-set-${Date.now()}-${nextElementId.current++}`
      const variants = existingSet
        ? layer.elements.filter((element) => element.variantSetId === setId && element.component)
        : [live]
      const followingRoots = existingSet ? variants.filter((variant) => variant.y > live.y) : []
      const followingIds = new Set(followingRoots.flatMap((variant) => withDescendants(layer.elements, variant).map((element) => element.id)))
      const shift = live.height + VARIANT_SPACING
      const arrangedElements = followingIds.size
        ? layer.elements.map((element) => followingIds.has(element.id) ? { ...element, y: element.y + shift } : element)
        : layer.elements
      const arrangedLive = arrangedElements.find((element) => element.id === live.id) ?? live
      const variantProperty = Object.keys(live.variantProperties ?? {})[0] ?? 'variant'
      const copies = cloneComponentTree(arrangedElements, arrangedLive,
        () => `variant-${Date.now()}-${nextElementId.current++}`, { x: 0, y: live.height + VARIANT_SPACING })
      copies[0] = { ...copies[0], parentId: setId, variantSetId: setId,
        variantProperties: {
          ...(live.variantProperties ?? { [variantProperty]: 'Primary' }),
          [variantProperty]: `Variant ${variants.length + 1}`,
        } }
      const arrangedVariants = variants.map((variant) => arrangedElements.find((element) => element.id === variant.id) ?? variant)
      const roots = [...arrangedVariants.map((variant) => variant.id === live.id
        ? { ...variant, parentId: setId, variantSetId: setId,
          variantProperties: variant.variantProperties ?? { [variantProperty]: 'Primary' } } : variant), copies[0]]
      const bounds = getElementsBounds(roots)
      if (!bounds) return current
      const componentSet: FrameElement = existingSet ? { ...existingSet,
        x: bounds.x - 24, y: bounds.y - 36, width: bounds.width + 48, height: bounds.height + 60 }
        : { id: setId, name: live.name, type: 'frame', componentSet: true,
          x: bounds.x - 24, y: bounds.y - 36, width: bounds.width + 48, height: bounds.height + 60,
          fill: 'rgba(0,0,0,0)', visible: true, locked: false, radius: 12, rotation: 0, opacity: 1, effects: [],
          clipContent: false, layoutMode: 'none', gap: VARIANT_SPACING, padding: 24, alignX: 'start', alignY: 'start',
          fixedWidth: true, fixedHeight: true, parentId: live.parentId }
      const rootUpdates = new Map(roots.map((root) => [root.id, root]))
      return { ...current, activeElementId: copies[0].id, selectedElementIds: [copies[0].id],
        layers: current.layers.map((candidate) => candidate.id !== layer.id ? candidate : { ...candidate,
          elements: [componentSet, ...arrangedElements.filter((element) => element.id !== setId)
            .map((element) => rootUpdates.get(element.id) ?? element), ...copies] }) }
    })
  }

  function switchVariant(instance: CanvasElement, componentId: string) {
    if (!instance.instanceOf || instance.instanceOf === componentId) return
    setDocument((current) => {
      const all = current.layers.flatMap((layer) => layer.elements)
      const sourceElements = allDocumentLayers(current).flatMap((layer) => layer.elements)
      const target = sourceElements.find((element) => element.id === componentId && element.component)
      if (!target) return current
      const instanceTree = withDescendants(all, instance)
      const textOverrides = new Map(instanceTree.filter((element): element is TextElement => element.type === 'text' && Boolean(element.componentPropertyName))
        .map((element) => [element.componentPropertyName!, element]))
      const instanceIds = new Set(instanceTree.map((element) => element.id))
      const targetTree = withDescendants(sourceElements, target)
      const ids = new Map(targetTree.map((element, index) => [element.id,
        index === 0 ? instance.id : `instance-${Date.now()}-${nextElementId.current++}`]))
      const replacements = targetTree.map((element, index): CanvasElement => {
        const textOverride = element.type === 'text' && element.componentPropertyName
          ? textOverrides.get(element.componentPropertyName) : undefined
        return ({ ...structuredClone(element),
        id: ids.get(element.id)!, name: index === 0 ? instance.name : element.name,
        x: instance.x + element.x - target.x, y: instance.y + element.y - target.y,
        parentId: index === 0 ? instance.parentId : element.parentId ? ids.get(element.parentId) : instance.id,
        component: false, variantSetId: undefined, variantProperties: undefined,
        ...(index === 0 ? { instanceOf: target.id, overrides: instance.overrides ?? [] }
          : { instanceOf: undefined, componentSourceId: element.id, overrides: textOverride ? ['text'] : [] }),
        ...(element.type === 'text' && textOverride ? { text: textOverride.text } : {}),
      }) as CanvasElement })
      return { ...current, layers: current.layers.map((layer) => ({ ...layer,
        elements: [...layer.elements.filter((element) => !instanceIds.has(element.id)),
          ...(layer.elements.some((element) => element.id === instance.id) ? replacements : [])] })) }
    })
  }

  async function insertImageFiles(files: File[], screenPoint?: Point) {
    const { prepareImageFile } = await import('./images')
    const canvas = canvasRef.current
    if (!canvas) return
    const images = await Promise.all(files.filter((file) => file.type.startsWith('image/')).map(prepareImageFile))
    if (!images.length) return
    const anchor = screenPoint ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
    setDocument((current) => {
      const targetLayerIndex = current.layers.findIndex((layer) => !layer.locked)
      if (targetLayerIndex < 0) return current
      const ids: string[] = []
      const elements = images.map((image, index) => {
        const id = `image-${Date.now()}-${nextElementId.current++}`
        ids.push(id)
        return { id, name: image.name, type: 'image' as const, src: image.src, visible: true, locked: false, opacity: 1,
          x: (anchor.x - viewport.x) / viewport.zoom - image.width / 2 + index * 20,
          y: (anchor.y - viewport.y) / viewport.zoom - image.height / 2 + index * 20,
          width: image.width, height: image.height }
      })
      return { ...current, activeElementId: ids.at(-1) ?? null, selectedElementIds: ids,
        layers: current.layers.map((layer, index) => index === targetLayerIndex
          ? { ...layer, elements: [...layer.elements, ...elements] } : layer) }
    })
    setActiveTool('select')
  }

  function insertComponentInstance(componentId: string, screenPoint: Point) {
    const documentPoint = { x: (screenPoint.x - viewport.x) / viewport.zoom, y: (screenPoint.y - viewport.y) / viewport.zoom }
    setDocument((current) => {
      const sourceLayer = allDocumentLayers(current).find((layer) => layer.elements.some((element) => element.id === componentId))
      const component = sourceLayer?.elements.find((element) => element.id === componentId && element.component)
      const targetLayerIndex = current.layers.findIndex((layer) => !layer.locked)
      if (!sourceLayer || !component || targetLayerIndex < 0) return current
      const copies = createInstanceTree(sourceLayer.elements, component,
        () => `instance-${Date.now()}-${nextElementId.current++}`, documentPoint)
      return { ...current, activeElementId: copies[0].id, selectedElementIds: [copies[0].id],
        layers: current.layers.map((layer, index) => index === targetLayerIndex
          ? { ...layer, elements: [...layer.elements, ...copies] } : layer) }
    })
    setActiveTool('select')
  }

  function insertFramePreset(preset: FramePreset) {
    const id = `frame-${Date.now()}-${nextElementId.current++}`
    const frame: FrameElement = { id, name: preset.name, type: 'frame', fill: '#FFFFFF', visible: true,
      locked: false, rotation: 0, opacity: 1, effects: [], radius: 0, clipContent: true, layoutMode: 'none',
      gap: 10, padding: 10, alignX: 'start', alignY: 'start', fixedWidth: true, fixedHeight: true,
      x: (canvasSize.width / 2 - viewport.x) / viewport.zoom - preset.width / 2,
      y: (canvasSize.height / 2 - viewport.y) / viewport.zoom - preset.height / 2,
      width: preset.width, height: preset.height }
    setDocument((current) => {
      const targetLayerIndex = current.layers.findIndex((layer) => !layer.locked)
      if (targetLayerIndex < 0) return current
      return { ...current, activeElementId: id, selectedElementIds: [id],
        layers: current.layers.map((layer, index) => index === targetLayerIndex
          ? { ...layer, elements: [...layer.elements, frame] } : layer) }
    })
    setActiveTool('select')
  }

  return <>
    <canvas ref={canvasRef} role="img" aria-label="Editor canvas" className="block h-full w-full touch-none"
      style={{ cursor: toolCursor(activeTool, spacePressed) }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-eve-component')
          || Array.from(event.dataTransfer.items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))) {
          event.preventDefault(); event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(event) => {
        const componentId = event.dataTransfer.getData('application/x-eve-component')
        if (componentId) {
          event.preventDefault()
          insertComponentInstance(componentId, pointerPosition(event.currentTarget, event))
          return
        }
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
        if (!files.length) return
        event.preventDefault()
        void insertImageFiles(files, pointerPosition(event.currentTarget, event))
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        const point = pointerPosition(event.currentTarget, event)
        const documentPoint = { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom }
        const candidates = spatialIndex.query({ x: documentPoint.x, y: documentPoint.y, width: 0, height: 0 })
        const target = [...candidates].reverse().find((element) => containsElementPoint(element, documentPoint))
        if (!target) { setContextMenu(null); return }
        setDocument((current) => ({ ...current, activeElementId: target.id, selectedElementIds: [target.id] }))
        setContextMenu({ x: event.clientX, y: event.clientY, elementId: target.id })
      }}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction} onPointerCancel={cancelInteraction}
      onPointerLeave={() => { if (interactionRef.current?.kind !== 'radius') setRadiusHoverId(null) }}
      onDoubleClick={handleDoubleClick} />
    {documentLoaded && (() => {
      const selected = resolvedDocument.layers.flatMap((layer) => layer.elements)
        .filter((element) => document.selectedElementIds.includes(element.id))
      if (!selected.length) return null
      const bounds = getElementsBounds(selected)
      if (!bounds) return null
      const screenBounds = { x: viewport.x + bounds.x * viewport.zoom, y: viewport.y + bounds.y * viewport.zoom,
        width: bounds.width * viewport.zoom, height: bounds.height * viewport.zoom }
      return <OffscreenSelectionIndicator bounds={screenBounds} viewport={canvasSize} onLocate={() => {
        setViewport((current) => ({ ...current,
          x: canvasSize.width / 2 - (bounds.x + bounds.width / 2) * current.zoom,
          y: canvasSize.height / 2 - (bounds.y + bounds.height / 2) * current.zoom }))
      }} />
    })()}
    {documentLoaded && (() => {
      const selected = document.selectedElementIds.length === 1
        ? findElement(resolvedDocument.layers, document.selectedElementIds[0]) : undefined
      if (!selected?.component || !selected.variantSetId) return null
      return <button aria-label="Add variant" onPointerDown={(event) => event.stopPropagation()}
        onClick={() => createVariant(selected)}
        className="group absolute z-30 grid size-5 -translate-x-1/2 place-items-center rounded-md bg-purple-500 text-sm font-semibold leading-none text-white shadow-sm hover:bg-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
        style={{ left: viewport.x + (selected.x + selected.width / 2) * viewport.zoom,
          top: viewport.y + (selected.y + selected.height + 32) * viewport.zoom + 6 }}>
        <IconPlus size={14} stroke={2.2} />
        <span role="tooltip" className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Add variant
        </span>
      </button>
    })()}
    {contextMenu && (() => {
      const element = findElement(document.layers, contextMenu.elementId)
      if (!element) return null
      const updateContextElement = (update: (item: CanvasElement) => CanvasElement) => {
        setDocument((current) => ({ ...current, layers: updateElement(current.layers, contextMenu.elementId,
          (item) => {
            const next = update(item)
            const changed = Object.keys(next).filter((key) => JSON.stringify((next as unknown as Record<string, unknown>)[key])
              !== JSON.stringify((item as unknown as Record<string, unknown>)[key]))
            return withInstanceOverrides(next, changed)
          }) }))
        setContextMenu(null)
      }
      const reorder = (front: boolean) => {
        setDocument((current) => ({ ...current, layers: current.layers.map((layer) => {
          const index = layer.elements.findIndex((item) => item.id === contextMenu.elementId)
          if (index < 0) return layer
          const elements = [...layer.elements]
          const [item] = elements.splice(index, 1)
          if (front) elements.push(item); else elements.unshift(item)
          return { ...layer, elements }
        }) }))
        setContextMenu(null)
      }
      return <div role="menu" aria-label="Element actions" className="fixed z-50 min-w-52 rounded-[10px] border border-neutral-200 bg-white p-1.5 text-xs text-neutral-800 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
        style={{ left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 275) }}
        onContextMenu={(event) => event.preventDefault()}>
        <button role="menuitem" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100"
          onClick={() => { styleClipboardRef.current = copyElementStyle(element); setContextMenu(null) }}>
          <span>Copy style</span><span className="text-neutral-400">⇧⌘C</span>
        </button>
        <button role="menuitem" disabled={!styleClipboardRef.current}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
          onClick={() => {
            const style = styleClipboardRef.current
            if (style) updateContextElement((item) => pasteElementStyle(item, style))
          }}>
          <span>Paste style</span><span className="text-neutral-400">⇧⌘V</span>
        </button>
        <div className="my-1 border-t border-neutral-200" />
        <button role="menuitem" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100"
          onClick={() => updateContextElement((item) => ({ ...item, visible: !item.visible }))}>
          <span>{element.visible ? 'Hide' : 'Show'}</span><span className="text-neutral-400">⇧⌘H</span>
        </button>
        <button role="menuitem" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100"
          onClick={() => updateContextElement((item) => ({ ...item, locked: !item.locked }))}>
          <span>{element.locked ? 'Unlock' : 'Lock'}</span><span className="text-neutral-400">⇧⌘L</span>
        </button>
        <div className="my-1 border-t border-neutral-200" />
        <button role="menuitem" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100"
          onClick={() => reorder(true)}><span>Bring to front</span><span className="text-neutral-400">]</span></button>
        <button role="menuitem" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-neutral-100"
          onClick={() => reorder(false)}><span>Send to back</span><span className="text-neutral-400">[</span></button>
      </div>
    })()}
    <LayerPanel document={document} onChange={setDocument} zoom={viewport.zoom}
      onVariableModeChange={(collectionId, modeId) => {
        setModeTransition({ from: resolvedDocument, progress: 0 })
        setDocument((current) => ({ ...current, variableModes: { ...(current.variableModes ?? {}), [collectionId]: modeId } }))
      }} />
    {!assetsOpen && !historyOpen && activeTool !== 'frame' && (() => {
      const propertyDocument = resolvedDocument
      const selected = document.selectedElementIds.length === 1
        ? findElement(propertyDocument.layers, document.selectedElementIds[0]) : undefined
      return selected?.type === 'text'
        ? <TypographyPanel element={selected}
            insideAutoLayout={Boolean(selected.parentId && (() => {
              const parent = findElement(document.layers, selected.parentId)
              return parent?.type === 'frame' && parent.layoutMode !== 'none'
            })())}
            variables={(document.variableCollections ?? []).flatMap((collection) => collection.variables)}
            canExposeComponentProperty={(() => {
              const all = document.layers.flatMap((layer) => layer.elements)
              let root: CanvasElement | undefined = selected
              while (root?.parentId) root = all.find((element) => element.id === root?.parentId)
              return Boolean(root?.component && !root.instanceOf)
            })()}
            onExposeComponentProperty={(name) => setDocument((current) => {
              const all = current.layers.flatMap((layer) => layer.elements)
              let root: CanvasElement | undefined = all.find((element) => element.id === selected.id)
              while (root?.parentId) root = all.find((element) => element.id === root?.parentId)
              const variantRoots = root?.variantSetId ? all.filter((element) => element.component && element.variantSetId === root?.variantSetId) : root ? [root] : []
              const targetIds = new Set(variantRoots.flatMap((variantRoot) => withDescendants(all, variantRoot)
                .filter((element) => element.type === 'text' && (element.id === selected.id || element.name === selected.name))
                .map((element) => element.id)))
              return { ...current, layers: current.layers.map((layer) => ({ ...layer, elements: layer.elements.map((element) =>
                targetIds.has(element.id) && element.type === 'text' ? { ...element, componentPropertyName: name } : element) })) }
            })}
            onBindVariable={(property, variableId) => setDocument((current) => ({ ...current,
              layers: updateElement(current.layers, selected.id, (element) => bindElementVariable(current, element, property, variableId, selected)) }))}
            onChange={(update) => setDocument((current) => ({ ...current,
            layers: updateElement(current.layers, selected.id, (element) => {
              if (element.type !== 'text') return element
              const next = { ...element, ...update }
              if (update.fontSize !== undefined && element.autoWidth !== false) {
                const scale = update.fontSize / element.fontSize
                next.width = element.width * scale
                next.height = element.height * scale
              }
              if (update.lineHeight !== undefined && element.autoWidth !== false) next.height = next.fontSize * update.lineHeight
              if (update.letterSpacing !== undefined && element.autoWidth !== false) next.width = Math.max(24,
                element.width + (update.letterSpacing - element.letterSpacing) * Math.max(0, element.text.length - 1))
              const context = canvasRef.current?.getContext('2d')
              if (context && next.autoWidth !== false) next.width = measureTextWidth(context, next)
              if (context && next.autoHeight !== false && !next.fillHeight) next.height = measureTextHeight(context, next, next.width)
              return withInstanceOverrides(next, Object.keys(update))
            }) }))} />
        : selected?.type === 'rectangle' || selected?.type === 'circle' || selected?.type === 'frame'
          ? <RectanglePropertiesPanel element={selected}
              insideAutoLayout={Boolean(selected.parentId && (() => {
                const parent = findElement(document.layers, selected.parentId)
                return parent?.type === 'frame' && parent.layoutMode !== 'none'
              })())}
              variables={(document.variableCollections ?? []).flatMap((collection) => collection.variables)}
              variableCollections={document.variableCollections ?? []}
              instanceTextProperties={selected.instanceOf ? withDescendants(document.layers.flatMap((layer) => layer.elements), selected)
                .filter((element): element is TextElement => element.type === 'text' && Boolean(element.componentPropertyName))
                .map((element) => ({ id: element.id, name: element.componentPropertyName!, value: element.text })) : []}
              onChangeInstanceTextProperty={(id, value) => setDocument((current) => {
                const context = canvasRef.current?.getContext('2d')
                const layers = updateElement(current.layers, id, (element) => {
                  if (element.type !== 'text') return element
                  const next = { ...element, text: value }
                  const keys = ['text']
                  if (context && next.autoWidth !== false && !next.fillWidth) {
                    next.width = measureTextWidth(context, next); keys.push('width')
                  }
                  if (context && next.autoHeight !== false && !next.fillHeight) {
                    next.height = measureTextHeight(context, next, next.width); keys.push('height')
                  }
                  return withInstanceOverrides(next, keys)
                })
                return { ...current, layers: layers.map((layer) => ({ ...layer, elements: applyFrameLayouts(layer.elements) })) }
              })}
              onCreateVariant={() => createVariant(selected)}
              instanceVariantProperties={(() => {
                if (!selected.instanceOf) return []
                const sourceLayers = allDocumentLayers(document)
                const source = findElement(sourceLayers, selected.instanceOf)
                if (!source?.variantSetId) return []
                const siblings = sourceLayers.flatMap((layer) => layer.elements)
                  .filter((element) => element.component && element.variantSetId === source.variantSetId)
                const properties = [...new Set(siblings.flatMap((element) => Object.keys(element.variantProperties ?? {})))]
                return properties.map((property) => ({ property, value: source.variantProperties?.[property] ?? '',
                  values: [...new Set(siblings.map((element) => element.variantProperties?.[property] ?? '').filter(Boolean))] }))
              })()}
              onSwitchVariantProperty={(property, value) => {
                if (!selected.instanceOf) return
                const sourceLayers = allDocumentLayers(document)
                const source = findElement(sourceLayers, selected.instanceOf)
                if (!source?.variantSetId) return
                const siblings = sourceLayers.flatMap((layer) => layer.elements)
                  .filter((element) => element.component && element.variantSetId === source.variantSetId)
                const desired = { ...(source.variantProperties ?? {}), [property]: value }
                const target = siblings.find((element) => Object.entries(desired)
                  .every(([key, expected]) => element.variantProperties?.[key] === expected))
                  ?? siblings.find((element) => element.variantProperties?.[property] === value)
                if (target) switchVariant(selected, target.id)
              }}
              currentVariant={(() => {
                if (!selected.component || !selected.variantSetId) return undefined
                const siblings = document.layers.flatMap((layer) => layer.elements)
                  .filter((element) => element.component && element.variantSetId === selected.variantSetId)
                const propertyNames = [...new Set(siblings.flatMap((element) => Object.keys(element.variantProperties ?? {})))]
                return { properties: propertyNames.map((property) => ({ property,
                  value: selected.variantProperties?.[property] ?? '', values: [...new Set(siblings
                    .map((element) => element.variantProperties?.[property] ?? '').filter(Boolean))] })) }
              })()}
              onChangeVariantProperty={(previous, property) => {
                const nextProperty = property.trimStart()
                if (!selected.variantSetId) return
                setDocument((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer,
                  elements: layer.elements.map((element) => {
                    if (!element.component || element.variantSetId !== selected.variantSetId) return element
                    const entries = Object.entries(element.variantProperties ?? {})
                      .map(([key, value]) => [key === previous ? nextProperty : key, value])
                    return { ...element, variantProperties: Object.fromEntries(entries) }
                  }) })) }))
              }}
              onChangeVariantValue={(property, value) => setDocument((current) => ({ ...current,
                layers: updateElement(current.layers, selected.id, (element) => ({ ...element,
                  variantProperties: { ...(element.variantProperties ?? {}), [property]: value } })) }))}
              onAddVariantProperty={() => {
                if (!selected.variantSetId) return
                setDocument((current) => {
                  const siblings = current.layers.flatMap((layer) => layer.elements)
                    .filter((element) => element.component && element.variantSetId === selected.variantSetId)
                  const keys = new Set(siblings.flatMap((element) => Object.keys(element.variantProperties ?? {})))
                  let index = keys.size + 1
                  while (keys.has(`Property ${index}`)) index += 1
                  const property = `Property ${index}`
                  return { ...current, layers: current.layers.map((layer) => ({ ...layer,
                    elements: layer.elements.map((element) => element.component && element.variantSetId === selected.variantSetId
                      ? { ...element, variantProperties: { ...(element.variantProperties ?? {}), [property]: 'Default' } } : element) })) }
                })
              }}
              onBindVariable={(property, variableId) => setDocument((current) => ({ ...current,
                layers: updateElement(current.layers, selected.id, (element) => bindElementVariable(current, element, property, variableId, selected)) }))}
              onChange={(update) => setDocument((current) => {
                const layers = current.layers.map((layer) => {
                  let elements = updateElement([layer], selected.id, (element) => element.type === 'rectangle' || element.type === 'circle' || element.type === 'frame'
                  ? withInstanceOverrides({ ...element, ...update, width: Math.max(1, update.width ?? element.width),
                    height: Math.max(1, update.height ?? element.height),
                    ...(element.type === 'rectangle' || element.type === 'frame' ? { radius: Math.max(0, Math.min(
                      ('radius' in update ? update.radius : undefined) ?? element.radius ?? 0,
                      Math.min(update.width ?? element.width, update.height ?? element.height) / 2)) } : {}),
                    ...(element.type === 'frame' && update.clipContent !== undefined
                      ? { clipContent: update.clipContent } : {}),
                    ...(element.type === 'frame' ? {
                      fixedWidth: update.fixedWidth ?? (update.width !== undefined ? true : element.fixedWidth),
                      fixedHeight: update.fixedHeight ?? (update.height !== undefined ? true : element.fixedHeight),
                    } : {}) }, Object.keys(update))
                  : element)[0].elements
                  return { ...layer, elements: applyFrameLayouts(elements) }
                })
                return { ...current, layers }
              })}
              onResetOverride={(property) => setDocument((current) => ({ ...current,
                layers: updateElement(current.layers, selected.id, (element) => ({ ...element,
                  overrides: (element.overrides ?? []).filter((key) => key !== property) })) }))}
              onResetInstance={() => setDocument((current) => {
                const all = current.layers.flatMap((layer) => layer.elements)
                let root = all.find((element) => element.id === selected.id)
                while (root?.parentId) root = all.find((element) => element.id === root?.parentId)
                if (!root?.instanceOf) return current
                const belongsToInstance = (element: CanvasElement) => {
                  let candidate: CanvasElement | undefined = element
                  while (candidate?.parentId) candidate = all.find((parent) => parent.id === candidate?.parentId)
                  return candidate?.id === root?.id
                }
                return { ...current, layers: current.layers.map((layer) => ({ ...layer,
                  elements: layer.elements.map((element) => belongsToInstance(element)
                    ? { ...element, overrides: [] } : element) })) }
              })}
              onResetOthers={() => setDocument((current) => {
                const all = current.layers.flatMap((layer) => layer.elements)
                let root = all.find((element) => element.id === selected.id)
                while (root?.parentId) root = all.find((element) => element.id === root?.parentId)
                if (!root?.instanceOf) return current
                const belongsToInstance = (element: CanvasElement) => {
                  let candidate: CanvasElement | undefined = element
                  while (candidate?.parentId) candidate = all.find((parent) => parent.id === candidate?.parentId)
                  return candidate?.id === root?.id
                }
                return { ...current, layers: current.layers.map((layer) => ({ ...layer,
                  elements: layer.elements.map((element) => belongsToInstance(element) && element.id !== selected.id
                    ? { ...element, overrides: [] } : element) })) }
              })}
              onAlign={(alignment) => alignRectangle(selected, alignment)} />
          : selected ? null
            : <CanvasPropertiesPanel background={document.background ?? '#E0E0E0'}
                onChange={(background) => setDocument((current) => ({ ...current, background }))} />
    })()}
    {frameNameDraft && <input autoFocus aria-label="Frame name" value={frameNameDraft.value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setFrameNameDraft({ ...frameNameDraft, value: event.target.value,
        width: Math.max(48 * viewport.zoom, (event.target.value.length * 7 + 12) * viewport.zoom) })}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={commitFrameName}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setFrameNameDraft(null)
      }}
      className="absolute z-40 border-blue-500 bg-white font-semibold text-blue-600 outline-none"
      style={{ left: frameNameDraft.left, top: frameNameDraft.top, width: frameNameDraft.width,
        height: 18 * viewport.zoom, paddingInline: 2 * viewport.zoom,
        borderWidth: Math.max(1, viewport.zoom), borderRadius: 2 * viewport.zoom,
        fontSize: 11 * viewport.zoom, lineHeight: `${16 * viewport.zoom}px` }} />}
    {textDraft && <input ref={textInputRef} autoFocus aria-label="Text content" value={textDraft.text}
      onChange={(event) => setTextDraft({ ...textDraft, text: event.target.value,
        cursorOffset: event.target.selectionStart ?? event.target.value.length,
        selectionStart: event.target.selectionStart ?? event.target.value.length,
        selectionEnd: event.target.selectionEnd ?? event.target.value.length })}
      onSelect={(event) => {
        const selectionStart = event.currentTarget.selectionStart
        const selectionEnd = event.currentTarget.selectionEnd
        setTextDraft((current) => current ? { ...current,
          cursorOffset: selectionEnd ?? current.text.length,
          selectionStart: selectionStart ?? current.text.length,
          selectionEnd: selectionEnd ?? current.text.length } : current)
      }}
      onBlur={commitText} onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault()
          const selectionEnd = textDraft.text.length
          event.currentTarget.setSelectionRange(0, selectionEnd)
          setTextDraft((current) => current ? { ...current, cursorOffset: selectionEnd, selectionStart: 0, selectionEnd } : current)
          return
        }
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setTextDraft(null)
      }}
      className="pointer-events-none absolute z-30 size-px overflow-hidden opacity-0"
      style={{ left: textDraft.screenX, top: textDraft.screenY }} />}
    <ToolbarPanel activeTool={activeTool} onToolChange={(tool) => { setActiveTool(tool); setHistoryOpen(false); setAssetsOpen(false) }}
      onDownload={() => { void import('./export').then(({ downloadDocument }) => downloadDocument(document)) }}
      onHistory={() => { setVariablesOpen(false); setAssetsOpen(false); setHistoryOpen(true) }}
      onVariables={() => { setAssetsOpen(false); setVariablesOpen(true) }} onAssets={() => {
        if (assetsOpen) { setAssetsOpen(false); return }
        setHistoryOpen(false); setVariablesOpen(false); setActiveTool('select')
        setDocument((current) => ({ ...current, activeElementId: null, selectedElementIds: [] }))
        setAssetsOpen(true)
      }} />
    {assetsOpen && <Suspense fallback={panelFallback}><AssetsPanel document={document} onClose={() => setAssetsOpen(false)} /></Suspense>}
    {!historyOpen && activeTool === 'frame' && <Suspense fallback={panelFallback}><FramePresetsPanel onSelect={insertFramePreset} /></Suspense>}
    {variablesOpen && <Suspense fallback={panelFallback}><VariablesPanel document={document} onChange={setDocument} onClose={() => setVariablesOpen(false)} /></Suspense>}
    {historyOpen && <Suspense fallback={panelFallback}><HistoryPanel entries={history} previewId={previewEntry?.id ?? null}
      onPreview={(entry) => { void hydrateDocumentAssets(entry.document).then((document) => setPreviewEntry({ ...entry, document })) }}
      onCancel={() => { setPreviewEntry(null); setHistoryOpen(false) }}
      onRollback={confirmRollback} /></Suspense>}
  </>
}
