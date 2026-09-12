import { IconArrowLeft, IconChevronRight, IconFolder, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { getElementsBounds } from './layers'
import { allDocumentLayers } from './pages'
import { renderCanvas } from './render'
import type { CanvasDocument, CanvasElement } from './types'
import { useVirtualRows } from './useVirtualRows'

function AssetPreview({ elements }: { elements: CanvasElement[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const bounds = getElementsBounds(elements)
    if (!canvas || !context || !bounds) return
    const scale = Math.min(48 / Math.max(1, bounds.width), 36 / Math.max(1, bounds.height))
    renderCanvas(context, { layers: [{ id: 'asset-preview', name: '', visible: true, expanded: true, elements }],
      activeElementId: null, selectedElementIds: [], background: '#FFFFFF' }, 56, 44,
    { zoom: scale, x: 28 - (bounds.x + bounds.width / 2) * scale, y: 22 - (bounds.y + bounds.height / 2) * scale }, null)
  }, [elements])
  return <canvas ref={canvasRef} width={56} height={44} aria-hidden="true" className="size-full" />
}

export function AssetsPanel({ document, onClose }: { document: CanvasDocument; onClose: () => void }) {
  const [path, setPath] = useState<string[]>([])
  const assets = useMemo(() => {
    const allElements = allDocumentLayers(document).flatMap((layer) => layer.elements)
    const children = new Map<string, CanvasElement[]>()
    for (const element of allElements) if (element.parentId) {
      const items = children.get(element.parentId) ?? []
      items.push(element); children.set(element.parentId, items)
    }
    const descendants = (root: CanvasElement) => {
      const result: CanvasElement[] = []; const pending = [...(children.get(root.id) ?? [])].reverse()
      while (pending.length) {
        const child = pending.pop()!; result.push(child); pending.push(...[...(children.get(child.id) ?? [])].reverse())
      }
      return result
    }
    const variantsBySet = new Map<string, CanvasElement[]>()
    for (const element of allElements) if (element.component && element.variantSetId) {
      const variants = variantsBySet.get(element.variantSetId) ?? []
      variants.push(element); variantsBySet.set(element.variantSetId, variants)
    }
    return allElements.flatMap((element) => {
    if (element.type === 'frame' && element.componentSet) {
      const variants = variantsBySet.get(element.id) ?? []
      const component = variants[0]
      return component ? [{ id: component.id, name: element.name,
        variants: variants.length, elements: [component, ...descendants(component)] }] : []
    }
    return element.component && !element.variantSetId ? [{ id: element.id, name: element.name, variants: 1,
      elements: [element, ...descendants(element)] }] : []
    })
  }, [document])
  const prefix = path.length ? `${path.join('/')}/` : ''
  const visibleAssets = assets.filter((asset) => asset.name.split('/').map((part) => part.trim()).filter(Boolean).slice(0, -1).join('/') === path.join('/'))
  const folders = [...new Set(assets.flatMap((asset) => {
    if (!asset.name.startsWith(prefix)) return []
    const remainder = asset.name.slice(prefix.length)
    return remainder.includes('/') ? [remainder.split('/')[0].trim()] : []
  }))]
  const rows = useMemo(() => [
    ...folders.map((folder) => ({ kind: 'folder' as const, id: `folder:${folder}`, folder })),
    ...visibleAssets.map((asset) => ({ kind: 'asset' as const, id: `asset:${asset.id}`, asset })),
  ], [folders, visibleAssets])
  const virtual = useVirtualRows(rows.length, 60)

  return <aside aria-label="Assets panel" className="absolute bottom-4 right-4 top-4 z-30 flex w-72 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
    <header className="flex h-11 shrink-0 items-center border-b border-neutral-100 px-3.5">
      <h2 className="text-sm font-semibold text-neutral-900">Assets</h2><span className="flex-1" />
      <Button aria-label="Close assets" onPress={onClose} className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100"><IconX size={17} /></Button>
    </header>
    <div ref={virtual.containerRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      {path.length > 0 && <div className="mb-2 flex h-8 items-center gap-1 border-b border-neutral-100 pb-2 text-[10px] font-medium text-neutral-500">
        <Button aria-label="Back to asset folders" onPress={() => setPath((current) => current.slice(0, -1))} className="grid size-6 place-items-center rounded-md hover:bg-neutral-100"><IconArrowLeft size={14} /></Button>
        <span className="truncate">Created in this file&nbsp; / &nbsp;{path.join(' / ')}</span>
      </div>}
      {assets.length ? <div className="relative" style={{ height: virtual.totalHeight }}>
        <div className="absolute inset-x-0" style={{ transform: `translateY(${virtual.offset}px)` }}>
        {rows.slice(virtual.start, virtual.end).map((row) => row.kind === 'folder'
          ? <Button key={row.id} onPress={() => setPath((current) => [...current, row.folder])} className="mb-1 flex h-14 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-neutral-700 hover:bg-neutral-100">
            <IconFolder size={15} className="text-neutral-400" /><span className="min-w-0 flex-1 truncate">{row.folder}</span><IconChevronRight size={14} className="text-neutral-400" />
          </Button>
          : <div key={row.id} draggable onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-eve-component', row.asset.id)
        }} className="group mb-1 flex h-14 cursor-grab items-center gap-2 rounded-lg px-1.5 active:cursor-grabbing hover:bg-purple-50">
          <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white"><AssetPreview elements={row.asset.elements} /></div>
          <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-neutral-700">{row.asset.name.split('/').filter(Boolean).at(-1)}</div>
            <div className="mt-0.5 text-[9px] text-neutral-400">{row.asset.variants > 1 ? `${row.asset.variants} variants` : 'Component'}</div></div>
        </div>)}
        </div>
      </div> : <div className="grid h-32 place-items-center px-5 text-center text-xs text-neutral-400">Create a component on any page to see it here.</div>}
    </div>
  </aside>
}
