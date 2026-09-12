import { getHandlePoints, getRadiusHandlePoints, HANDLE_SIZE, MIN_CANVAS_CONTROL_ZOOM } from './geometry'
import { getElementsBounds, visibleElements } from './layers'
import type { SnapGuide } from './snapping'
import type { CanvasDocument, CanvasElement, CircleElement, FrameElement, Point, Rectangle, RectangleElement, TextElement } from './types'

const imageCache = new Map<string, HTMLImageElement>()
const MAX_CACHED_IMAGES = 128

function touchCachedImage(src: string, image: HTMLImageElement) {
  imageCache.delete(src)
  imageCache.set(src, image)
  while (imageCache.size > MAX_CACHED_IMAGES) imageCache.delete(imageCache.keys().next().value!)
}

function drawImage(context: CanvasRenderingContext2D, src: string, rectangle: Rectangle, onLoad?: () => void) {
  let image = imageCache.get(src)
  if (!image) {
    image = new Image()
    image.onload = () => onLoad?.()
    image.src = src
  }
  touchCachedImage(src, image)
  if (image.complete && image.naturalWidth) context.drawImage(image, rectangle.x, rectangle.y, rectangle.width, rectangle.height)
}

type TextStyle = { fontFamily: string; fontWeight: number; fontSize: number; letterSpacing: number; text: string }

function shadowColor(color: string, opacity: number) {
  const hex = color.replace('#', '')
  const value = Number.parseInt(hex.length === 3 ? hex.split('').map((character) => character.repeat(2)).join('') : hex, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`
}

function shapePath(context: CanvasRenderingContext2D, element: RectangleElement | CircleElement | FrameElement, x: number, y: number) {
  context.beginPath()
  if (element.type === 'circle') context.ellipse(x + element.width / 2, y + element.height / 2,
    element.width / 2, element.height / 2, 0, 0, Math.PI * 2)
  else if (element.radius) context.roundRect(x, y, element.width, element.height, element.radius)
  else context.rect(x, y, element.width, element.height)
}

function fillRoundedLabel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 5) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.fill()
}

export function measureTextWidth(context: CanvasRenderingContext2D, element: TextStyle) {
  context.font = `${element.fontWeight} ${element.fontSize}px ${element.fontFamily}, ui-sans-serif, system-ui, sans-serif`
  context.letterSpacing = '0px'
  return Math.ceil(context.measureText(element.text).width
    + Math.max(0, element.text.length - 1) * element.letterSpacing)
}

export function measureTextHeight(context: CanvasRenderingContext2D, element: TextElement, width = element.width) {
  context.font = `${element.fontWeight} ${element.fontSize}px ${element.fontFamily}, ui-sans-serif, system-ui, sans-serif`
  context.letterSpacing = `${element.letterSpacing}px`
  return wrapText(context, element.text, width, element.letterSpacing).length * element.fontSize * element.lineHeight
}

export function textOffsetAtPoint(context: CanvasRenderingContext2D, element: TextElement, point: Point) {
  context.font = `${element.fontWeight} ${element.fontSize}px ${element.fontFamily}, ui-sans-serif, system-ui, sans-serif`
  context.letterSpacing = `${element.letterSpacing}px`
  const lines = wrapText(context, element.text, element.width, element.letterSpacing)
  const lineHeight = element.fontSize * element.lineHeight
  const totalHeight = lines.length * lineHeight
  const startY = element.verticalAlign === 'top' ? element.y : element.verticalAlign === 'middle'
    ? element.y + (element.height - totalHeight) / 2 : element.y + element.height - totalHeight
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((point.y - startY) / lineHeight)))
  const line = lines[lineIndex] ?? ''
  const lineStart = lineRanges(element.text, lines)[lineIndex]?.start ?? 0
  const lineWidth = textWidth(context, line, element.letterSpacing)
  const renderedLeft = element.textAlign === 'left' ? element.x : element.textAlign === 'center'
    ? element.x + (element.width - lineWidth) / 2 : element.x + element.width - lineWidth
  const localX = point.x - renderedLeft
  let closest = 0
  let closestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index <= line.length; index += 1) {
    const distance = Math.abs(textWidth(context, line.slice(0, index), element.letterSpacing) - localX)
    if (distance < closestDistance) { closest = index; closestDistance = distance }
  }
  return Math.min(element.text.length, lineStart + closest)
}

function textWidth(context: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  return context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, letterSpacing: number) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [text]
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
      const candidate = line + word
      if (line && textWidth(context, candidate, letterSpacing) > maxWidth && word.trim()) {
        lines.push(line.trimEnd()); line = word.trimStart()
      } else line = candidate
      while (textWidth(context, line, letterSpacing) > maxWidth && line.length > 1) {
        let split = line.length - 1
        while (split > 1 && textWidth(context, line.slice(0, split), letterSpacing) > maxWidth) split -= 1
        lines.push(line.slice(0, split)); line = line.slice(split)
      }
    }
    lines.push(line || '')
  }
  return lines
}

function lineRanges(text: string, lines: string[]) {
  let searchStart = 0
  return lines.map((line) => {
    const found = text.indexOf(line, searchStart)
    const start = found < 0 ? searchStart : found
    const range = { text: line, start, end: start + line.length }
    searchStart = range.end
    return range
  })
}

function drawText(context: CanvasRenderingContext2D, element: TextElement) {
  context.font = `${element.fontWeight} ${element.fontSize}px ${element.fontFamily}, ui-sans-serif, system-ui, sans-serif`
  context.letterSpacing = `${element.letterSpacing}px`
  context.textAlign = element.textAlign
  context.textBaseline = 'top'
  const lines = wrapText(context, element.text, element.width, element.letterSpacing)
  const lineHeight = element.fontSize * element.lineHeight
  const totalHeight = lines.length * lineHeight
  const startY = element.verticalAlign === 'top' ? element.y : element.verticalAlign === 'middle'
    ? element.y + (element.height - totalHeight) / 2 : element.y + element.height - totalHeight
  const x = element.textAlign === 'left' ? element.x : element.textAlign === 'center' ? element.x + element.width / 2 : element.x + element.width
  lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight))
}

function renderSelection(context: CanvasRenderingContext2D, rectangle: Rectangle, selectedShape?: RectangleElement | CircleElement | FrameElement, showRadiusLabel = false, showPaddingLabel = false, paddingSide?: 'top' | 'right' | 'bottom' | 'left', suppressResizeHandles = false, zoom = 1, showRadiusHandles = false) {
  const accent = selectedShape?.component || selectedShape?.instanceOf ? '#a855f7' : '#2563eb'
  const rotation = selectedShape ? ((selectedShape.rotation ?? 0) * Math.PI) / 180 : 0
  const center = { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 }
  const frame = rotation
    ? { x: -rectangle.width / 2, y: -rectangle.height / 2, width: rectangle.width, height: rectangle.height }
    : rectangle
  const frameRectangle = (selectedShape?.type === 'rectangle' || selectedShape?.type === 'frame') && rotation
    ? { ...selectedShape, x: frame.x, y: frame.y }
    : selectedShape?.type === 'rectangle' || selectedShape?.type === 'frame' ? selectedShape : undefined

  context.save()
  if (rotation) {
    context.translate(center.x, center.y)
    context.rotate(rotation)
  }
  context.strokeStyle = accent
  context.lineWidth = 2 / zoom
  context.strokeRect(frame.x, frame.y, frame.width, frame.height)
  context.fillStyle = '#ffffff'
  context.lineWidth = 1.5 / zoom
  const resizeHandles = Object.entries(getHandlePoints(frame)).filter(([handle]) => handle.includes('-'))
  const hideResizeHandles = suppressResizeHandles || zoom < MIN_CANVAS_CONTROL_ZOOM
  if (!hideResizeHandles) for (const [, point] of resizeHandles) {
      const size = HANDLE_SIZE / zoom
      const offset = size / 2
      context.fillRect(point.x - offset, point.y - offset, size, size)
      context.strokeRect(point.x - offset, point.y - offset, size, size)
    }
  if (frameRectangle && !hideResizeHandles && showRadiusHandles) {
    for (const point of Object.values(getRadiusHandlePoints(frameRectangle))) {
      context.beginPath()
      context.arc(point.x, point.y, 4.5 / zoom, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  }
  if (selectedShape?.type === 'frame' && selectedShape.layoutMode !== 'none' && !hideResizeHandles) {
    const padding = Math.max(0, selectedShape.padding)
    if (paddingSide && padding > 0) {
      const area = paddingSide === 'top' ? { x: frame.x, y: frame.y, width: frame.width, height: padding }
        : paddingSide === 'right' ? { x: frame.x + frame.width - padding, y: frame.y, width: padding, height: frame.height }
          : paddingSide === 'bottom' ? { x: frame.x, y: frame.y + frame.height - padding, width: frame.width, height: padding }
            : { x: frame.x, y: frame.y, width: padding, height: frame.height }
      context.save()
      context.fillStyle = 'rgba(59, 130, 246, 0.12)'
      context.fillRect(area.x, area.y, area.width, area.height)
      context.beginPath(); context.rect(area.x, area.y, area.width, area.height); context.clip()
      context.strokeStyle = 'rgba(59, 130, 246, 0.55)'; context.lineWidth = 1
      for (let offset = -area.height; offset < area.width + area.height; offset += 6) {
        context.beginPath(); context.moveTo(area.x + offset, area.y + area.height)
        context.lineTo(area.x + offset + area.height, area.y); context.stroke()
      }
      context.restore()
      const value = `${Math.round(padding)}`
      const labelX = paddingSide === 'left' ? frame.x + padding / 2 : paddingSide === 'right' ? frame.x + frame.width - padding / 2 : frame.x + frame.width / 2
      const labelY = paddingSide === 'top' ? frame.y + padding / 2 : paddingSide === 'bottom' ? frame.y + frame.height - padding / 2 : frame.y + frame.height / 2
      context.fillStyle = '#2563eb'; fillRoundedLabel(context, labelX - 10, labelY - 9, 20, 18)
      context.fillStyle = '#fff'; context.font = '11px ui-sans-serif, system-ui, sans-serif'
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(value, labelX, labelY)
    }
    const ticks = [
      [{ x: frame.x + frame.width / 2 - 6, y: frame.y + padding }, { x: frame.x + frame.width / 2 + 6, y: frame.y + padding }],
      [{ x: frame.x + frame.width - padding, y: frame.y + frame.height / 2 - 6 }, { x: frame.x + frame.width - padding, y: frame.y + frame.height / 2 + 6 }],
      [{ x: frame.x + frame.width / 2 - 6, y: frame.y + frame.height - padding }, { x: frame.x + frame.width / 2 + 6, y: frame.y + frame.height - padding }],
      [{ x: frame.x + padding, y: frame.y + frame.height / 2 - 6 }, { x: frame.x + padding, y: frame.y + frame.height / 2 + 6 }],
    ]
    context.strokeStyle = '#3b82f6'
    context.lineWidth = 1.5
    for (const [start, end] of ticks) {
      context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke()
    }
    if (showPaddingLabel) {
      const label = `${Math.round(padding)}`
      const labelWidth = Math.max(44, label.length * 7 + 20)
      const labelX = frame.x + frame.width / 2 - labelWidth / 2
      const labelY = frame.y - 34
      context.fillStyle = '#262626'
      fillRoundedLabel(context, labelX, labelY, labelWidth, 26)
      context.fillStyle = '#ffffff'
      context.font = '12px ui-sans-serif, system-ui, sans-serif'
      context.textAlign = 'center'; context.textBaseline = 'middle'
      context.fillText(label, frame.x + frame.width / 2, labelY + 13)
    }
  }
  context.restore()
  if (hideResizeHandles) return
  if (zoom < MIN_CANVAS_CONTROL_ZOOM) return

  const rotatePoint = (point: Point) => rotation ? {
    x: center.x + point.x * Math.cos(rotation) - point.y * Math.sin(rotation),
    y: center.y + point.x * Math.sin(rotation) + point.y * Math.cos(rotation),
  } : point
  const widthMode = selectedShape?.fillWidth ? ' Fill'
    : selectedShape?.type === 'frame' && selectedShape.fixedWidth === false ? ' Hug' : ''
  const heightMode = selectedShape?.fillHeight ? ' Fill'
    : selectedShape?.type === 'frame' && selectedShape.fixedHeight === false ? ' Hug' : ''
  const label = `${Math.round(rectangle.width)}${widthMode} × ${Math.round(rectangle.height)}${heightMode}`
  const labelWidth = Math.max(52, label.length * 7 + 12) / zoom
  const labelAnchor = rotatePoint(rotation
    ? { x: 0, y: rectangle.height / 2 + 10 / zoom }
    : { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height + 10 / zoom })
  const labelX = labelAnchor.x - labelWidth / 2
  const labelY = labelAnchor.y
  context.fillStyle = accent
  fillRoundedLabel(context, labelX, labelY, labelWidth, 22 / zoom, 5 / zoom)
  context.fillStyle = '#ffffff'
  context.font = `${12 / zoom}px ui-sans-serif, system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, labelAnchor.x, labelY + 11 / zoom)
}

function renderRadiusLabel(context: CanvasRenderingContext2D, element: RectangleElement | FrameElement, zoom: number) {
  const accent = element.component || element.instanceOf ? '#a855f7' : '#2563eb'
  const rotation = ((element.rotation ?? 0) * Math.PI) / 180
  const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
  const localAnchor = { x: -element.width / 2 + 14 / zoom, y: -element.height / 2 - 24 / zoom }
  const anchor = rotation ? {
    x: center.x + localAnchor.x * Math.cos(rotation) - localAnchor.y * Math.sin(rotation),
    y: center.y + localAnchor.x * Math.sin(rotation) + localAnchor.y * Math.cos(rotation),
  } : { x: element.x + 14 / zoom, y: element.y - 24 / zoom }
  const label = `Radius ${Math.round(element.radius ?? 0)}`
  const labelWidth = Math.max(58, label.length * 7 + 10) / zoom
  context.fillStyle = accent
  fillRoundedLabel(context, anchor.x, anchor.y, labelWidth, 20 / zoom, 5 / zoom)
  context.fillStyle = '#ffffff'
  context.font = `${11 / zoom}px ui-sans-serif, system-ui, sans-serif`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(label, anchor.x + 5 / zoom, anchor.y + 10 / zoom)
}

export type RenderTextDraft = Point & Pick<TextElement, 'text' | 'fontFamily' | 'fontWeight' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textAlign'> & {
  elementId?: string
  width?: number
  height?: number
  verticalAlign?: TextElement['verticalAlign']
  autoWidth?: boolean
  cursorOffset?: number
  selectionStart?: number
  selectionEnd?: number
}

export function renderCanvas(context: CanvasRenderingContext2D, document: CanvasDocument, width: number, height: number, viewport: { x: number; y: number; zoom: number }, marquee: Rectangle | null, textDraft?: RenderTextDraft, radiusEditingId?: string | null, dropTargetFrameId?: string | null, onImageLoad?: () => void, editingFrameNameId?: string | null, paddingEditingId?: string | null, snapGuides: SnapGuide[] = [], paddingHover?: { id: string; side: 'top' | 'right' | 'bottom' | 'left' } | null, radiusHoverId?: string | null, renderElements?: CanvasElement[], sceneElements?: CanvasElement[], renderPass: 'all' | 'scene' | 'overlays' = 'all') {
  const drawScene = renderPass !== 'overlays'
  const drawOverlays = renderPass !== 'scene'
  if (drawScene) {
    context.clearRect(0, 0, width, height)
    context.fillStyle = document.background ?? '#E0E0E0'
    context.fillRect(0, 0, width, height)
  }
  context.save()
  try {
    context.translate(viewport.x, viewport.y)
    context.scale(viewport.zoom, viewport.zoom)
    const allElements = sceneElements ?? visibleElements(document.layers)
    const elements = renderElements ?? allElements
    const elementsById = new Map(allElements.map((element) => [element.id, element]))
    const isInsideAutoLayout = (element: CanvasElement) => {
      let parent = element.parentId ? elementsById.get(element.parentId) : undefined
      const visited = new Set<string>()
      while (parent && !visited.has(parent.id)) {
        visited.add(parent.id)
        if (parent.type === 'frame' && parent.layoutMode !== 'none') return true
        parent = parent.parentId ? elementsById.get(parent.parentId) : undefined
      }
      return false
    }
    const selectedIds = new Set(document.selectedElementIds)
    const selectedElements = allElements.filter((item) => selectedIds.has(item.id))
    const inlineSelection = selectedElements.length === 1 && selectedElements[0].id !== textDraft?.elementId
    if (drawScene) for (const element of elements) {
    if (element.id === textDraft?.elementId) continue
    context.save()
    let parent = element.parentId ? elementsById.get(element.parentId) : undefined
    while (parent?.type === 'frame') {
      if (parent.clipContent) {
        const rotation = ((parent.rotation ?? 0) * Math.PI) / 180
        const centerX = parent.x + parent.width / 2
        const centerY = parent.y + parent.height / 2
        context.translate(centerX, centerY)
        if (rotation) context.rotate(rotation)
        shapePath(context, parent, -parent.width / 2, -parent.height / 2)
        context.clip()
        if (rotation) context.rotate(-rotation)
        context.translate(-centerX, -centerY)
      }
      parent = parent.parentId ? elementsById.get(parent.parentId) : undefined
    }
    if (element.type === 'text') {
      context.fillStyle = element.fill
      drawText(context, element)
    } else if (element.type === 'image') {
      context.save()
      context.globalAlpha = element.opacity ?? 1
      drawImage(context, element.src, element, onImageLoad)
      context.restore()
    } else {
      context.save()
      context.fillStyle = element.fill
      context.globalAlpha = element.opacity ?? 1
      const rotation = ((element.rotation ?? 0) * Math.PI) / 180
      if (rotation) {
        context.translate(element.x + element.width / 2, element.y + element.height / 2)
        context.rotate(rotation)
      }
      const x = rotation ? -element.width / 2 : element.x
      const y = rotation ? -element.height / 2 : element.y
      for (const effect of (element.effects ?? []).filter((item) => item.visible && item.type === 'drop-shadow')) {
        context.shadowColor = shadowColor(effect.color, effect.opacity)
        context.shadowOffsetX = effect.x
        context.shadowOffsetY = effect.y
        context.shadowBlur = effect.blur + effect.spread * 2
        shapePath(context, element, x, y)
        context.fill()
      }
      context.shadowColor = 'transparent'
      context.shadowOffsetX = 0
      context.shadowOffsetY = 0
      context.shadowBlur = 0
      if (element.type === 'circle' || element.radius) {
        shapePath(context, element, x, y)
        context.fill()
      } else context.fillRect(x, y, element.width, element.height)
      for (const effect of (element.effects ?? []).filter((item) => item.visible && item.type === 'inner-shadow')) {
        context.save()
        shapePath(context, element, x, y)
        context.clip()
        context.shadowColor = shadowColor(effect.color, effect.opacity)
        context.shadowOffsetX = effect.x
        context.shadowOffsetY = effect.y
        context.shadowBlur = effect.blur + effect.spread * 2
        context.fillStyle = effect.color
        context.beginPath()
        context.rect(x - element.width * 2, y - element.height * 2, element.width * 5, element.height * 5)
        if (element.type === 'circle') context.ellipse(x + element.width / 2, y + element.height / 2,
          element.width / 2, element.height / 2, 0, 0, Math.PI * 2)
        else context.roundRect(x, y, element.width, element.height, element.radius ?? 0)
        context.fill('evenodd')
        context.restore()
      }
      context.restore()
    }
    if (element.type === 'frame' && element.componentSet) {
      context.save()
      context.strokeStyle = '#a855f7'
      context.lineWidth = 2 / viewport.zoom
      context.setLineDash([10 / viewport.zoom, 6 / viewport.zoom])
      context.beginPath()
      context.roundRect(element.x, element.y, element.width, element.height, element.radius ?? 12)
      context.stroke()
      context.restore()
    }
    context.restore()
    if (renderPass === 'all' && inlineSelection && element.id === selectedElements[0].id) renderSelection(context, element,
      ['rectangle', 'circle', 'frame'].includes(element.type)
        ? element as RectangleElement | CircleElement | FrameElement : undefined,
      element.id === radiusEditingId, element.id === paddingEditingId,
      paddingHover?.id === element.id ? paddingHover.side : undefined,
      element.type === 'text' && isInsideAutoLayout(element), viewport.zoom,
      element.id === radiusHoverId || element.id === radiusEditingId)
    }
    if (!drawOverlays) return
    if (renderPass === 'overlays' && inlineSelection) {
      const element = selectedElements[0]
      renderSelection(context, element, ['rectangle', 'circle', 'frame'].includes(element.type)
        ? element as RectangleElement | CircleElement | FrameElement : undefined,
      element.id === radiusEditingId, element.id === paddingEditingId,
      paddingHover?.id === element.id ? paddingHover.side : undefined,
      element.type === 'text' && isInsideAutoLayout(element), viewport.zoom,
      element.id === radiusHoverId || element.id === radiusEditingId)
    }
    for (const frame of viewport.zoom >= MIN_CANVAS_CONTROL_ZOOM
      ? elements.filter((element) => (element.type === 'frame' || element.component || element.instanceOf) && !element.parentId) : []) {
      if (frame.id === editingFrameNameId) continue
      context.save()
      context.fillStyle = frame.component || frame.instanceOf || frame.type === 'frame' && frame.componentSet ? '#a855f7' : selectedIds.has(frame.id) ? '#2563eb' : '#525252'
      context.font = '600 11px ui-sans-serif, system-ui, sans-serif'
      context.textAlign = 'left'
      context.textBaseline = 'bottom'
      context.fillText(`${frame.type === 'frame' && frame.componentSet ? '◆◆ ' : frame.component ? '◆ ' : frame.instanceOf ? '◇ ' : ''}${frame.name}`, frame.x, frame.y - 4)
      context.restore()
    }
    if (snapGuides.length) {
      context.save()
      context.strokeStyle = '#f43f5e'
      context.lineWidth = 1 / viewport.zoom
      context.setLineDash?.([4 / viewport.zoom, 3 / viewport.zoom])
      for (const guide of snapGuides) {
        context.beginPath()
        if (guide.axis === 'x') { context.moveTo(guide.position, guide.start); context.lineTo(guide.position, guide.end) }
        else { context.moveTo(guide.start, guide.position); context.lineTo(guide.end, guide.position) }
        context.stroke()
      }
      context.setLineDash?.([])
      context.restore()
    }
    let draftBounds: Rectangle | undefined
    if (textDraft) {
      context.fillStyle = '#171717'
      context.font = `${textDraft.fontWeight} ${textDraft.fontSize}px ${textDraft.fontFamily}, ui-sans-serif, system-ui, sans-serif`
      context.letterSpacing = `${textDraft.letterSpacing}px`
      const measuredWidth = textWidth(context, textDraft.text, textDraft.letterSpacing)
      const draftWidth = textDraft.autoWidth === false ? (textDraft.width ?? measuredWidth) : Math.ceil(measuredWidth)
      const draftHeight = textDraft.height ?? textDraft.fontSize * textDraft.lineHeight
      const draftElement: TextElement = { id: textDraft.elementId ?? 'draft', name: textDraft.text, type: 'text',
        fill: '#171717', visible: true, x: textDraft.x, y: textDraft.y, width: Math.max(1, draftWidth), height: draftHeight,
        text: textDraft.text, fontFamily: textDraft.fontFamily, fontWeight: textDraft.fontWeight,
        fontSize: textDraft.fontSize, lineHeight: textDraft.lineHeight, letterSpacing: textDraft.letterSpacing,
        textAlign: textDraft.textAlign, verticalAlign: textDraft.verticalAlign ?? 'top', autoWidth: textDraft.autoWidth }
      const lines = wrapText(context, textDraft.text, draftElement.width, textDraft.letterSpacing)
      const offset = Math.max(0, Math.min(textDraft.text.length, textDraft.cursorOffset ?? textDraft.text.length))
      const ranges = lineRanges(textDraft.text, lines)
      const totalHeight = lines.length * textDraft.fontSize * textDraft.lineHeight
      const startY = draftElement.verticalAlign === 'top' ? textDraft.y : draftElement.verticalAlign === 'middle'
        ? textDraft.y + (draftElement.height - totalHeight) / 2 : textDraft.y + draftElement.height - totalHeight
      const selectionStart = Math.max(0, Math.min(textDraft.text.length, textDraft.selectionStart ?? offset))
      const selectionEnd = Math.max(selectionStart, Math.min(textDraft.text.length, textDraft.selectionEnd ?? offset))
      if (selectionEnd > selectionStart) {
        context.fillStyle = 'rgba(37, 99, 235, 0.24)'
        ranges.forEach((lineRange, index) => {
          const from = Math.max(selectionStart, lineRange.start)
          const to = Math.min(selectionEnd, lineRange.end)
          if (to <= from) return
          const lineWidth = textWidth(context, lineRange.text, textDraft.letterSpacing)
          const lineLeft = textDraft.textAlign === 'left' ? textDraft.x : textDraft.textAlign === 'center'
            ? textDraft.x + (draftElement.width - lineWidth) / 2 : textDraft.x + draftElement.width - lineWidth
          const prefix = lineRange.text.slice(0, from - lineRange.start)
          const selected = lineRange.text.slice(from - lineRange.start, to - lineRange.start)
          context.fillRect(lineLeft + textWidth(context, prefix, textDraft.letterSpacing),
            startY + index * textDraft.fontSize * textDraft.lineHeight,
            textWidth(context, selected, textDraft.letterSpacing), textDraft.fontSize * textDraft.lineHeight)
        })
      }
      context.fillStyle = '#171717'
      drawText(context, draftElement)
      let cursorLineIndex = 0
      for (let index = 0; index < ranges.length; index += 1) {
        if (offset >= ranges[index].start) cursorLineIndex = index
      }
      const range = ranges[cursorLineIndex] ?? { text: '', start: 0, end: 0 }
      const cursorLine = range.text.slice(0, Math.max(0, Math.min(range.text.length, offset - range.start)))
      const cursorLineWidth = textWidth(context, cursorLine, textDraft.letterSpacing)
      const fullLine = range.text
      const fullLineWidth = textWidth(context, fullLine, textDraft.letterSpacing)
      const lineLeft = textDraft.textAlign === 'left' ? textDraft.x : textDraft.textAlign === 'center'
        ? textDraft.x + (draftElement.width - fullLineWidth) / 2 : textDraft.x + draftElement.width - fullLineWidth
      if (selectionEnd === selectionStart) context.fillRect(lineLeft + cursorLineWidth,
        startY + cursorLineIndex * textDraft.fontSize * textDraft.lineHeight,
        1.5, textDraft.fontSize * textDraft.lineHeight)
      draftBounds = draftElement
    }
    const candidate = dropTargetFrameId ? elementsById.get(dropTargetFrameId) : undefined
    const dropTarget = candidate?.type === 'frame' ? candidate : undefined
    if (dropTarget) {
      context.save()
      const rotation = ((dropTarget.rotation ?? 0) * Math.PI) / 180
      if (rotation) {
        context.translate(dropTarget.x + dropTarget.width / 2, dropTarget.y + dropTarget.height / 2)
        context.rotate(rotation)
      }
      const x = rotation ? -dropTarget.width / 2 : dropTarget.x
      const y = rotation ? -dropTarget.height / 2 : dropTarget.y
      shapePath(context, dropTarget, x, y)
      context.strokeStyle = '#2563eb'
      context.lineWidth = 3
      context.stroke()
      context.restore()
    }
    const selectionBounds = textDraft?.elementId && selectedElements.some((item) => item.id === textDraft.elementId)
      ? draftBounds ?? getElementsBounds(selectedElements) : getElementsBounds(selectedElements)
    if (selectionBounds && !inlineSelection) renderSelection(context, selectionBounds,
      selectedElements.length === 1 && ['rectangle', 'circle', 'frame'].includes(selectedElements[0].type)
        ? selectedElements[0] as RectangleElement | CircleElement | FrameElement : undefined,
      selectedElements.length === 1 && selectedElements[0].id === radiusEditingId, false, undefined,
      Boolean(selectedElements.length === 1 && selectedElements[0].type === 'text'
        && isInsideAutoLayout(selectedElements[0])), viewport.zoom,
      selectedElements[0]?.id === radiusHoverId || selectedElements[0]?.id === radiusEditingId)
    if (marquee) {
    context.fillStyle = 'rgba(37, 99, 235, 0.12)'
    context.fillRect(marquee.x, marquee.y, marquee.width, marquee.height)
    context.strokeStyle = '#2563eb'
    context.lineWidth = 1
    context.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height)
    }
    const radiusElement = selectedElements.length === 1 && selectedElements[0].id === radiusEditingId
      && (selectedElements[0].type === 'rectangle' || selectedElements[0].type === 'frame')
      ? selectedElements[0] : undefined
    if (radiusElement && viewport.zoom >= MIN_CANVAS_CONTROL_ZOOM) renderRadiusLabel(context, radiusElement, viewport.zoom)
  } finally {
    context.restore()
  }
}
