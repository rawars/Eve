import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayerPanel } from './LayerPanel'
import { AssetsPanel } from './AssetsPanel'
import { ensurePagesDocument } from './pages'
import type { CanvasDocument } from './types'

const document: CanvasDocument = {
  activeElementId: null,
  selectedElementIds: [],
  layers: [{
    id: 'layer', name: 'Main layer', expanded: true, visible: true,
    elements: [
      { id: 'frame', name: 'Frame', type: 'frame', x: 100, y: 100, width: 200, height: 200,
        fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
        alignX: 'start', alignY: 'start' },
      { id: 'item', name: 'Item', type: 'rectangle', x: 0, y: 0, width: 40, height: 40,
        fill: '#000', visible: true },
    ],
  }],
}

afterEach(cleanup)

describe('LayerPanel hierarchy', () => {
  it('separates the page list from the active page layers', () => {
    const onChange = vi.fn()
    const first = ensurePagesDocument(document)
    const second = { id: 'page-2', name: 'Checkout', layers: [{ id: 'checkout-layer', name: 'Checkout layer',
      expanded: true, visible: true, elements: [{ id: 'checkout-item', name: 'Checkout button', type: 'rectangle' as const,
        x: 0, y: 0, width: 100, height: 40, fill: '#000', visible: true }] }] }
    const paged = { ...first, pages: [...first.pages!, second] }
    const { getByRole, getByText, queryByText } = render(<LayerPanel document={paged} onChange={onChange} />)

    expect(getByRole('region', { name: 'Pages' })).toBeTruthy()
    expect(getByText('Layers')).toBeTruthy()
    expect(getByText('Item')).toBeTruthy()
    expect(queryByText('Checkout button')).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Open Checkout' }))
    const next = onChange.mock.calls.at(-1)?.[0] as CanvasDocument
    expect(next.activePageId).toBe('page-2')
    expect(next.layers[0].name).toBe('Checkout layer')
    expect(next.selectedElementIds).toEqual([])
  })

  it('renames pages from the page list', () => {
    const onChange = vi.fn()
    const paged = ensurePagesDocument(document)
    const { getByRole } = render(<LayerPanel document={paged} onChange={onChange} />)
    fireEvent.doubleClick(getByRole('button', { name: 'Open Page 1' }))
    const input = getByRole('textbox', { name: 'Page name in list' })
    fireEvent.change(input, { target: { value: 'Home' } })
    fireEvent.blur(input)
    const next = onChange.mock.calls.at(-1)?.[0] as CanvasDocument
    expect(next.pages?.[0].name).toBe('Home')
  })

  it('lists reusable components in the Assets tab', () => {
    const componentDocument = { ...document, layers: document.layers.map((layer) => ({ ...layer,
      elements: layer.elements.map((element) => element.id === 'item' ? { ...element, component: true, name: 'Button' } : element) })) }
    const { getByText } = render(<AssetsPanel document={componentDocument} onClose={vi.fn()} />)
    expect(getByText('Button')).toBeTruthy()
    expect(getByText('Component')).toBeTruthy()
  })

  it('groups slash-named components into navigable asset folders', () => {
    const componentDocument = { ...document, layers: document.layers.map((layer) => ({ ...layer,
      elements: [
        ...layer.elements,
        { id: 'primary-button', name: 'buttons/primary', type: 'rectangle' as const, x: 0, y: 0,
          width: 80, height: 32, fill: '#2563eb', visible: true, component: true },
        { id: 'icon-button', name: 'buttons/icons/add', type: 'rectangle' as const, x: 0, y: 0,
          width: 32, height: 32, fill: '#111827', visible: true, component: true },
      ],
    })) }
    const { getByText, queryByText } = render(<AssetsPanel document={componentDocument} onClose={vi.fn()} />)
    expect(getByText('buttons')).toBeTruthy()
    expect(queryByText('primary')).toBeNull()
    fireEvent.click(getByText('buttons'))
    expect(getByText('Created in this file / buttons')).toBeTruthy()
    expect(getByText('primary')).toBeTruthy()
    expect(getByText('icons')).toBeTruthy()
  })

  it('keeps assets global while switching between pages', () => {
    const first = ensurePagesDocument({ ...document, layers: document.layers.map((layer) => ({ ...layer,
      elements: layer.elements.map((element) => element.id === 'item' ? { ...element, component: true, name: 'Global Button' } : element) })) })
    const second = { id: 'page-2', name: 'Checkout', layers: [{ id: 'checkout-layer', name: 'Checkout', expanded: true, visible: true, elements: [] }] }
    const paged = { ...first, pages: [...first.pages!, second], activePageId: second.id, layers: second.layers }
    const { getByText } = render(<AssetsPanel document={paged} onClose={vi.fn()} />)
    expect(getByText('Global Button')).toBeTruthy()
  })

  it('mounts only visible asset cards in large libraries', () => {
    const elements = Array.from({ length: 1_000 }, (_, index) => ({ id: `asset-${index}`, name: `Asset ${index}`,
      type: 'rectangle' as const, x: 0, y: 0, width: 10, height: 10, fill: '#000', visible: true, component: true }))
    const large = { ...document, layers: [{ ...document.layers[0], elements }] }
    const { getByText, queryByText } = render(<AssetsPanel document={large} onClose={vi.fn()} />)
    expect(getByText('Asset 0')).toBeTruthy()
    expect(queryByText('Asset 999')).toBeNull()
  })

  it('moves an element into a frame by dropping it on the frame row', () => {
    const onChange = vi.fn()
    const { getByText } = render(<LayerPanel document={document} onChange={onChange} />)
    const item = getByText('Item').closest('[draggable="true"]') as HTMLElement
    const frame = getByText('Frame').closest('[draggable="true"]') as HTMLElement
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ top: -18, height: 72 } as DOMRect)
    const dataTransfer = { effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(item, { dataTransfer })
    fireEvent.dragOver(frame, { clientY: 18, dataTransfer })
    fireEvent.drop(frame, { clientY: 18, dataTransfer })
    const next = onChange.mock.calls.at(-1)?.[0] as CanvasDocument
    expect(next.layers[0].elements.find((element) => element.id === 'item')?.parentId).toBe('frame')
    expect(next.selectedElementIds).toEqual(['item'])
  })

  it('mounts only the visible layer rows for very large documents', () => {
    const elements = Array.from({ length: 1_000 }, (_, index) => ({ id: `item-${index}`, name: `Item ${index}`,
      type: 'rectangle' as const, x: index, y: 0, width: 10, height: 10, fill: '#000', visible: true }))
    const large = { ...document, layers: [{ ...document.layers[0], elements }] }
    const { getByText, queryByText } = render(<LayerPanel document={large} onChange={vi.fn()} />)
    expect(getByText('Item 0')).toBeTruthy()
    expect(queryByText('Item 999')).toBeNull()
  })
})
