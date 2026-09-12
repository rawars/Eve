import { IconBox, IconBoxMultiple, IconChevronDown, IconChevronRight, IconCircle, IconDiamond, IconDiamonds, IconEye, IconEyeOff, IconFile, IconFilePlus, IconLayersSubtract, IconLetterT, IconLock, IconLockOpen, IconPhoto, IconRectangle, IconTrash } from '@tabler/icons-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Button, Input } from 'react-aria-components'
import { syncActivePage, switchDocumentPage } from './pages'
import { globalVariableCollection } from './variables'
import type { CanvasDocument, CanvasElement } from './types'
import { useVirtualRows } from './useVirtualRows'

type Props = { document: CanvasDocument; onChange: (document: CanvasDocument) => void; zoom?: number
  onVariableModeChange?: (collectionId: string, modeId: string) => void }

export function LayerPanel({ document, onChange, zoom = 1, onVariableModeChange }: Props) {
  const collection = globalVariableCollection(document)
  const [editing, setEditing] = useState<{ kind: 'layer' | 'element'; id: string } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [dragged, setDragged] = useState<{ layerId: string; elementId: string } | null>(null)
  const draggedRef = useRef<{ layerId: string; elementId: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ elementId: string; position: 'before' | 'inside' | 'after' } | null>(null)
  const dropTargetRef = useRef<{ elementId: string; position: 'before' | 'inside' | 'after' } | null>(null)

  function updateLayer(id: string, update: (layer: CanvasDocument['layers'][number]) => CanvasDocument['layers'][number]) {
    onChange({ ...document, layers: document.layers.map((layer) => layer.id === id ? update(layer) : layer) })
  }

  function beginRename(kind: 'layer' | 'element', id: string, name: string) {
    setDraftName(name); setEditing({ kind, id })
  }

  function commitRename() {
    if (!editing) return
    const name = draftName.trim()
    if (name) onChange({ ...document, layers: document.layers.map((layer) => {
      if (editing.kind === 'layer' && layer.id === editing.id) return { ...layer, name }
      if (editing.kind === 'element') return { ...layer, elements: layer.elements.map((element) => element.id === editing.id ? { ...element, name } : element) }
      return layer
    }) })
    setEditing(null)
  }

  function nameInput(label: string) {
    return <Input autoFocus aria-label={label} value={draftName}
      onChange={(event) => setDraftName(event.target.value)} onBlur={commitRename}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setEditing(null)
      }}
      className="min-w-0 flex-1 rounded-md border border-blue-400 bg-white px-1.5 py-0.5 text-xs outline-none ring-2 ring-blue-100" />
  }

  const actionClass = 'grid size-6 shrink-0 place-items-center rounded-md text-neutral-400 outline-none hover:bg-neutral-200 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500'
  const pages = document.pages ?? []
  function addPage() {
    const synced = syncActivePage(document)
    const page = { id: `page-${Date.now()}`, name: `Page ${pages.length + 1}`,
      layers: [{ id: `layer-${Date.now()}`, name: 'Main layer', expanded: true, visible: true, locked: false, elements: [] }] }
    onChange({ ...synced, pages: [...(synced.pages ?? []), page], activePageId: page.id,
      layers: page.layers, activeElementId: null, selectedElementIds: [] })
  }

  function deleteActivePage() {
    if (pages.length <= 1) return
    if (!window.confirm('Delete this page and all of its canvas elements?')) return
    const remaining = pages.filter((page) => page.id !== document.activePageId)
    const next = remaining[0]
    onChange({ ...document, pages: remaining, activePageId: next.id, layers: next.layers,
      activeElementId: null, selectedElementIds: [] })
  }

  function descendants(elements: CanvasElement[], id: string) {
    const ids = new Set<string>()
    const visit = (parentId: string) => elements.filter((element) => element.parentId === parentId).forEach((element) => {
      ids.add(element.id); visit(element.id)
    })
    visit(id)
    return ids
  }

  function hierarchy(elements: CanvasElement[]) {
    const rows: { element: CanvasElement; depth: number }[] = []
    const visited = new Set<string>()
    const ids = new Set(elements.map((element) => element.id))
    const children = new Map<string, CanvasElement[]>()
    elements.forEach((element) => {
      if (!element.parentId) return
      const items = children.get(element.parentId) ?? []; items.push(element); children.set(element.parentId, items)
    })
    const visit = (element: CanvasElement, depth: number) => {
      if (visited.has(element.id)) return
      visited.add(element.id); rows.push({ element, depth })
      children.get(element.id)?.forEach((child) => visit(child, depth + 1))
    }
    elements.filter((element) => !element.parentId || !ids.has(element.parentId))
      .forEach((element) => visit(element, 0))
    elements.forEach((element) => visit(element, 0))
    return rows
  }

  function moveElement(targetId?: string, position: 'before' | 'inside' | 'after' | 'root' = 'root') {
    const dragSource = draggedRef.current
    if (!dragSource) return
    const sourceLayer = document.layers.find((layer) => layer.id === dragSource.layerId)
    const targetLayer = targetId
      ? document.layers.find((layer) => layer.elements.some((element) => element.id === targetId))
      : sourceLayer
    if (!sourceLayer || !targetLayer) return
    const source = sourceLayer.elements.find((element) => element.id === dragSource.elementId)
    const target = targetId ? targetLayer.elements.find((element) => element.id === targetId) : undefined
    if (!source || (position === 'inside' && target?.type !== 'frame')) return
    const sourceDescendants = descendants(sourceLayer.elements, source.id)
    if (target && (target.id === source.id || sourceDescendants.has(target.id))) return
    const blockIds = new Set([source.id, ...sourceDescendants])
    const block = sourceLayer.elements.filter((element) => blockIds.has(element.id))
    const layers = document.layers.map((layer) => ({ ...layer,
      elements: layer.elements.filter((element) => !blockIds.has(element.id)) }))
    const destination = layers.find((layer) => layer.id === targetLayer.id)
    if (!destination) return
    const targetIndex = target ? destination.elements.findIndex((element) => element.id === target.id) : -1
    const targetDescendants = target ? descendants(destination.elements, target.id) : new Set<string>()
    const afterIndex = targetIndex < 0 ? destination.elements.length : Math.max(targetIndex,
      ...destination.elements.map((element, index) => targetDescendants.has(element.id) ? index : -1)) + 1
    const insertionIndex = position === 'before' ? Math.max(0, targetIndex)
      : position === 'inside' ? afterIndex : position === 'after' ? afterIndex : destination.elements.length
    const parentId = position === 'inside' ? target?.id
      : position === 'root' ? undefined : target?.parentId
    block[0] = { ...block[0], parentId }
    destination.elements.splice(insertionIndex, 0, ...block)
    onChange({ ...document, activeElementId: source.id, selectedElementIds: [source.id], layers })
    draggedRef.current = null; dropTargetRef.current = null; setDragged(null); setDropTarget(null)
  }

  function dragPosition(event: DragEvent<HTMLDivElement>, element: CanvasElement) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - bounds.top) / bounds.height
    return element.type === 'frame' && (!Number.isFinite(ratio) || ratio >= 0.25 && ratio <= 0.75)
      ? 'inside' : ratio < 0.5 ? 'before' : 'after'
  }

  const layerMetrics = useMemo(() => {
    let offset = 0
    return document.layers.map((layer) => {
      const rows = layer.expanded ? hierarchy(layer.elements) : []
      const metric = { layer, rows, offset }
      offset += 1 + rows.length
      return metric
    })
  }, [document.layers])
  const layerRowCount = layerMetrics.reduce((count, metric) => count + 1 + metric.rows.length, 0)
  const virtualLayers = useVirtualRows(layerRowCount, 36)

  return <>
  <aside aria-label="Variable mode" className="absolute left-4 top-4 z-10 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Variable mode</div>
    <div>
      <label className="text-[10px] font-medium text-neutral-500">{collection?.name ?? 'Theme'} mode
        <span className="relative mt-1 flex items-center rounded-md border border-neutral-200 bg-neutral-50">
          <select aria-label="Layer panel active mode" disabled={!collection}
            value={collection ? document.variableModes?.[collection.id] ?? collection.modes[0].id : ''}
            onChange={(event) => {
              if (!collection) return
              if (onVariableModeChange) onVariableModeChange(collection.id, event.target.value)
              else onChange({ ...document, variableModes: { ...(document.variableModes ?? {}), [collection.id]: event.target.value } })
            }}
            className="h-7 min-w-0 w-full appearance-none bg-transparent pl-2 pr-6 text-[11px] font-semibold outline-none disabled:text-neutral-300">
            {collection?.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
          </select><IconChevronDown className="pointer-events-none absolute right-1.5 text-neutral-400" size={12} />
        </span>
      </label>
    </div>
  </aside>
  <aside className="absolute bottom-4 left-4 top-[132px] z-10 flex w-72 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="border-b border-neutral-100 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-neutral-900"><IconFile size={14} />
        <Input aria-label="Page name" value={pages.find((page) => page.id === document.activePageId)?.name ?? ''}
          onChange={(event) => onChange({ ...document, pages: pages.map((page) => page.id === document.activePageId ? { ...page, name: event.target.value } : page) })}
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none focus:text-blue-600" />
        <output aria-label="Current zoom" className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-1 text-[10px] font-medium tabular-nums text-neutral-500">
          {Math.round(zoom * 100)}%
        </output>
      </div>
      <div className="flex items-center gap-1">
        <span className="relative min-w-0 flex-1">
          <select aria-label="Active page" value={document.activePageId ?? ''} onChange={(event) => onChange(switchDocumentPage(document, event.target.value))}
            className="h-8 w-full appearance-none rounded-lg border border-neutral-200 bg-neutral-50 pl-2.5 pr-7 text-xs font-medium outline-none focus:border-blue-400">
            {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
          </select><IconChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-neutral-400" />
        </span>
        <Button aria-label="Create page" onPress={addPage} className={actionClass}><IconFilePlus size={15} /></Button>
        <Button aria-label="Delete page" isDisabled={pages.length <= 1} onPress={deleteActivePage} className={`${actionClass} disabled:opacity-30`}><IconTrash size={14} /></Button>
      </div>
      <div className="mt-2 flex h-7 items-center gap-1.5 rounded-lg bg-neutral-100 px-2 text-xs font-semibold text-neutral-900"><IconLayersSubtract size={14} />Layers</div>
    </header>
    <div ref={virtualLayers.containerRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
      <div className="relative" style={{ height: virtualLayers.totalHeight }}>
      {layerMetrics.map(({ layer, rows, offset }) => {
        const childStart = Math.max(0, virtualLayers.start - offset - 1)
        const childEnd = Math.min(rows.length, virtualLayers.end - offset - 1)
        const showHeader = offset >= virtualLayers.start && offset < virtualLayers.end
        if (!showHeader && childEnd <= childStart) return null
        return <div key={layer.id} className="absolute inset-x-0" style={{ top: offset * 36 }}>
        <div style={{ height: showHeader ? undefined : 36 }}>
        {showHeader && <div className="group flex h-9 items-center gap-1 rounded-lg px-1.5 text-xs text-neutral-700 hover:bg-neutral-50">
          <Button aria-label={layer.expanded ? 'Collapse layer' : 'Expand layer'} className={actionClass}
            onPress={() => updateLayer(layer.id, (current) => ({ ...current, expanded: !current.expanded }))}>
            <IconChevronRight size={14} stroke={1.8} aria-hidden="true" className={`transition-transform ${layer.expanded ? 'rotate-90' : ''}`} />
          </Button>
          <IconLayersSubtract size={15} stroke={1.6} className="shrink-0 text-neutral-400" aria-hidden="true" />
          {editing?.kind === 'layer' && editing.id === layer.id ? nameInput('Layer name')
            : <span onDoubleClick={() => beginRename('layer', layer.id, layer.name)} className="min-w-0 flex-1 truncate font-medium">{layer.name}</span>}
          <span className="mr-0.5 text-[10px] tabular-nums text-neutral-300">{layer.elements.length}</span>
          <Button aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} className={actionClass}
            onPress={() => updateLayer(layer.id, (current) => ({ ...current, locked: !current.locked }))}>
            {layer.locked ? <IconLock size={14} stroke={1.8} /> : <IconLockOpen size={14} stroke={1.6} />}
          </Button>
          <Button aria-label={layer.visible ? 'Hide layer' : 'Show layer'} className={actionClass}
            onPress={() => updateLayer(layer.id, (current) => ({ ...current, visible: !current.visible }))}>
            {layer.visible ? <IconEye size={15} stroke={1.7} /> : <IconEyeOff size={15} stroke={1.7} />}
          </Button>
        </div>}
        </div>
        {layer.expanded && <div className={`relative ml-[25px] min-h-3 pl-2 before:absolute before:bottom-1 before:left-0 before:top-0 before:w-px before:bg-neutral-100 ${dragged ? 'pb-3' : ''}`}
          onDragOver={(event) => { if (dragged) event.preventDefault() }}
          onDrop={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); moveElement(undefined, 'root') } }}>
          {childStart > 0 && <div style={{ height: childStart * 36 }} />}
          {rows.slice(childStart, childEnd).map(({ element, depth }) => {
            const active = document.selectedElementIds.includes(element.id)
            const effectivelyVisible = layer.visible && element.visible
            const effectivelyLocked = Boolean(layer.locked || element.locked)
            const targetPosition = dropTarget?.elementId === element.id ? dropTarget.position : null
            return <div key={element.id} draggable={!editing && !effectivelyLocked}
              style={{ marginLeft: depth * 16 }}
              onDragStart={(event) => {
                const source = { layerId: layer.id, elementId: element.id }
                draggedRef.current = source; setDragged(source); event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => { draggedRef.current = null; dropTargetRef.current = null; setDragged(null); setDropTarget(null) }}
              onDragOver={(event) => {
                if (!draggedRef.current) return
                const position = dragPosition(event, element)
                event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'
                dropTargetRef.current = { elementId: element.id, position }
                setDropTarget(dropTargetRef.current)
              }}
              onDrop={(event) => {
                event.preventDefault(); event.stopPropagation()
                const position = dropTargetRef.current?.elementId === element.id
                  ? dropTargetRef.current.position : dragPosition(event, element)
                moveElement(element.id, position)
              }}
              onClick={(event) => {
                if (!event.shiftKey) { onChange({ ...document, activeElementId: element.id, selectedElementIds: [element.id] }); return }
                const selectedElementIds = document.selectedElementIds.includes(element.id)
                  ? document.selectedElementIds.filter((id) => id !== element.id)
                  : [...document.selectedElementIds, element.id]
                onChange({ ...document, activeElementId: selectedElementIds.at(-1) ?? null, selectedElementIds })
              }}
              className={`relative flex h-9 cursor-grab items-center gap-1.5 rounded-lg px-2 text-xs active:cursor-grabbing
                ${active ? 'bg-blue-50 text-blue-700' : 'text-neutral-600 hover:bg-neutral-50'}
                ${targetPosition === 'inside' ? 'ring-2 ring-inset ring-blue-500' : ''}
                ${targetPosition === 'before' ? 'before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:bg-blue-500' : ''}
                ${targetPosition === 'after' ? 'after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-blue-500' : ''}`}>
              {element.component || element.instanceOf || element.type === 'frame' && element.componentSet
                ? element.type === 'frame' && element.componentSet ? <IconDiamonds size={14} className="shrink-0 text-purple-500" aria-hidden="true" />
                  : element.component ? <IconDiamond size={14} className="shrink-0 text-purple-500" aria-hidden="true" />
                    : <IconBoxMultiple size={14} className="shrink-0 text-purple-500" aria-hidden="true" />
                : element.type === 'text'
                ? <IconLetterT size={14} stroke={1.6} className={active ? 'text-blue-500' : 'text-neutral-400'} aria-hidden="true" />
                : element.type === 'image'
                  ? <IconPhoto size={14} stroke={1.6} className={active ? 'text-blue-500' : 'text-neutral-400'} aria-hidden="true" />
                  : element.type === 'circle'
                    ? <IconCircle size={14} stroke={1.6} className={active ? 'text-blue-500' : 'text-neutral-400'} aria-hidden="true" />
                  : element.type === 'frame'
                    ? <IconBox size={14} stroke={1.6} className={active ? 'text-blue-500' : 'text-neutral-400'} aria-hidden="true" />
                  : <IconRectangle size={14} stroke={1.6} className={active ? 'text-blue-500' : 'text-neutral-400'} aria-hidden="true" />}
              {editing?.kind === 'element' && editing.id === element.id ? nameInput('Element name')
                : <span onDoubleClick={(event) => { event.stopPropagation(); beginRename('element', element.id, element.name) }} className="min-w-0 flex-1 truncate">{element.name}</span>}
              <Button aria-label={layer.locked ? `${element.name} locked by layer` : element.locked ? `Unlock ${element.name}` : `Lock ${element.name}`}
                isDisabled={Boolean(layer.locked)} className={`${actionClass} disabled:cursor-not-allowed disabled:opacity-50`}
                onPress={() => updateLayer(layer.id, (current) => ({ ...current, elements: current.elements.map((item) => item.id === element.id ? { ...item, locked: !item.locked } : item) }))}>
                {effectivelyLocked ? <IconLock size={14} stroke={1.8} /> : <IconLockOpen size={14} stroke={1.6} />}
              </Button>
              <Button aria-label={effectivelyVisible ? `Hide ${element.name}` : `Show ${element.name}`} className={actionClass}
                onPress={() => updateLayer(layer.id, (current) => ({ ...current, elements: current.elements.map((item) => item.id === element.id
                  ? { ...item, visible: !item.visible,
                    ...((item.instanceOf || item.componentSourceId)
                      ? { overrides: [...new Set([...(item.overrides ?? []), 'visible'])] } : {}) }
                  : item) }))}>
                {effectivelyVisible ? <IconEye size={15} stroke={1.7} /> : <IconEyeOff size={15} stroke={1.7} />}
              </Button>
            </div>
          })}
          {childEnd < rows.length && <div style={{ height: (rows.length - childEnd) * 36 }} />}
          {dragged && <div className="mx-1 mt-1 rounded-md border border-dashed border-blue-300 px-2 py-1.5 text-[10px] text-blue-500"
            onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDropTarget(null) }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveElement(undefined, 'root') }}>
            Move to layer root
          </div>}
        </div>}
      </div>})}
      </div>
    </div>
  </aside>
  </>
}
