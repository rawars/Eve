import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

const context = {
  clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), setTransform: vi.fn(),
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
  scale: vi.fn(), rotate: vi.fn(),
  beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), rect: vi.fn(), clip: vi.fn(), fill: vi.fn(), stroke: vi.fn(), roundRect: vi.fn(),
  fillText: vi.fn(), font: '', textAlign: '', textBaseline: '',
  drawImage: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 13 })), letterSpacing: '',
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
}

describe('App', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    })
  })

  it('renders a centered rectangle', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    expect(canvas).toBeInTheDocument()
    expect(canvas.style.cursor).toContain('data:image/svg+xml')
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 240, 160)
  })

  it('lets foreground elements cover the selection outline of an element behind them', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'back', selectedElementIds: ['back'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'back', name: 'Back', type: 'rectangle', x: 100, y: 100, width: 200, height: 200,
            fill: '#ddd', visible: true },
          { id: 'front', name: 'Front', type: 'rectangle', x: 180, y: 180, width: 100, height: 40,
            fill: '#fff', visible: true },
        ],
      }],
    }))
    render(<App />)
    const outlineIndex = context.strokeRect.mock.calls.findIndex((call) => call[0] === 100 && call[1] === 100
      && call[2] === 200 && call[3] === 200)
    const frontIndex = context.fillRect.mock.calls.findIndex((call) => call[0] === 180 && call[1] === 180
      && call[2] === 100 && call[3] === 40)
    expect(context.strokeRect.mock.invocationCallOrder[outlineIndex])
      .toBeLessThan(context.fillRect.mock.invocationCallOrder[frontIndex])
  })

  it('redraws the canvas after the viewport is resized', () => {
    render(<App />)
    context.fillRect.mockClear()
    vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 900, height: 650, top: 0, left: 0, right: 900, bottom: 650, x: 0, y: 0, toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 240, 160)
  })

  it('shows the floating canvas toolbar and changes the active tool', () => {
    const { getByRole } = render(<App />)
    const rectangleTool = getByRole('button', { name: 'Rectangle' })
    expect(getByRole('navigation', { name: 'Canvas tools' })).toBeInTheDocument()
    fireEvent.click(rectangleTool)
    expect(getByRole('button', { name: 'Circle' })).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Rectangle' }))
    expect(rectangleTool).toHaveAttribute('aria-pressed', 'true')
    expect(getByRole('button', { name: 'Download canvas JSON' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Version history' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Variables' })).toBeInTheDocument()
    expect(within(getByRole('complementary', { name: 'Rectangle properties' })).getByRole('heading', { name: 'Rectangle' })).toBeInTheDocument()
  })

  it('creates collections and typed variables in the variables view', async () => {
    const { getByRole, findByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Variables' }))
    const variablesView = await findByRole('region', { name: 'Variables view' })
    expect(variablesView).toBeInTheDocument()
    expect(within(variablesView).getByLabelText('Variable collection')).toHaveValue('theme')
    fireEvent.click(within(variablesView).getByRole('button', { name: 'Create collection' }))
    fireEvent.change(within(variablesView).getByLabelText('Collection name'), { target: { value: 'Palette' } })
    fireEvent.click(within(variablesView).getByRole('button', { name: 'Add variable' }))
    expect(within(variablesView).getByText('Palette')).toBeInTheDocument()
    expect(within(variablesView).getByLabelText('color 1 Light')).toHaveValue('#000000')
    expect(within(variablesView).getByLabelText('color 1 Dark')).toHaveValue('#000000')
    fireEvent.change(within(variablesView).getByLabelText('Dark mode name'), { target: { value: 'Dim' } })
    expect(within(variablesView).getByLabelText('Dim mode name')).toBeInTheDocument()
    fireEvent.click(within(variablesView).getByRole('button', { name: 'Add mode' }))
    expect(within(variablesView).getByLabelText('Mode 3 mode name')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(within(variablesView).getByRole('button', { name: 'Delete collection' }))
    expect(within(variablesView).getByLabelText('Variable collection')).toHaveValue('theme')
  })

  it('updates bound property values when the active variable mode changes', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'card', selectedElementIds: ['card'], variableModes: { palette: 'light' },
      variableCollections: [{ id: 'palette', name: 'Palette', modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
        variables: [{ id: 'surface', name: 'Surface', type: 'color', values: { light: '#FFFFFF', dark: '#111827' } }] }],
      layers: [{ id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
        { id: 'card', name: 'Card', type: 'rectangle', x: 100, y: 100, width: 100, height: 80,
          fill: '#FFFFFF', visible: true, variableBindings: { fill: 'surface' } },
      ] }],
    }))
    const { getByLabelText } = render(<App />)
    expect(getByLabelText('Change Fill variable')).toBeInTheDocument()
    expect(getByLabelText('Fill color preview')).toBeInTheDocument()
    fireEvent.change(getByLabelText('Layer panel active mode'), { target: { value: 'dark' } })
    expect(getByLabelText('Fill color preview')).toHaveStyle({ backgroundColor: '#111827' })
    fireEvent.click(getByLabelText('Detach Fill variable'))
    expect(getByLabelText('Rectangle fill')).toHaveValue('#111827')
  })

  it('switches drawing tools with T, R, O, and F shortcuts', () => {
    const { getByRole } = render(<App />)
    fireEvent.keyDown(window, { key: 't' })
    expect(getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(window, { key: 'r' })
    expect(getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(window, { key: 'o' })
    expect(getByRole('button', { name: 'Circle' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(window, { key: 'f' })
    expect(getByRole('button', { name: 'Frame' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates named frames from grouped device presets', async () => {
    const { getByRole, findByRole, getByText, getByLabelText } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Frame' }))
    expect(await findByRole('complementary', { name: 'Frame presets' })).toBeInTheDocument()
    expect(getByLabelText('Frame template library')).toHaveValue('Apple Devices')
    fireEvent.click(getByText('iPad mini 8.3'))
    expect(getByText('iPad mini 8.3')).toBeInTheDocument()
    expect(getByLabelText('Width')).toHaveValue('744')
    expect(getByLabelText('Height')).toHaveValue('1,133')
    expect(getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches between Apple, Android, and Web frame libraries', async () => {
    const { getByRole, findByRole, getByLabelText, getByText } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Frame' }))
    await findByRole('complementary', { name: 'Frame presets' })
    fireEvent.change(getByLabelText('Frame template library'), { target: { value: 'Android Devices' } })
    expect(getByText('Google Pixel 9 Pro Fold')).toBeInTheDocument()
    fireEvent.change(getByLabelText('Frame template library'), { target: { value: 'Web' } })
    expect(getByText('OpenGraph')).toBeInTheDocument()
  })

  it('creates a component with Option Command K', () => {
    const { getByRole } = render(<App />)
    fireEvent.keyDown(window, { key: '˚', code: 'KeyK', metaKey: true, altKey: true })
    expect(context.fillText).toHaveBeenCalledWith('◆ Rectangle', 280, 216)
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD', metaKey: true })
    expect(context.fillText).toHaveBeenCalledWith('◇ Rectangle instance', 304, 240)
  })

  it('keeps components in global Assets when changing pages', async () => {
    const { getByRole, findByRole, getByLabelText, getAllByText, queryByText } = render(<App />)
    fireEvent.keyDown(window, { key: '˚', code: 'KeyK', metaKey: true, altKey: true })
    fireEvent.click(getByRole('button', { name: 'Create page' }))
    expect(getByLabelText('Active page')).not.toHaveValue('page-1')
    expect(queryByText('Rectangle')).toBeNull()
    fireEvent.click(getByRole('button', { name: 'Assets' }))
    expect(await findByRole('complementary', { name: 'Assets panel' })).toBeInTheDocument()
    expect(getAllByText('Rectangle')).toHaveLength(1)
    fireEvent.change(getByLabelText('Active page'), { target: { value: 'page-1' } })
    expect(getAllByText('Rectangle').length).toBeGreaterThan(1)
  })

  it('opens Assets as the exclusive panel on the right and clears the selection', async () => {
    const { getByRole, findByRole, queryByRole } = render(<App />)
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Assets' }))
    const assets = await findByRole('complementary', { name: 'Assets panel' })
    expect(assets).toHaveClass('right-4')
    expect(queryByRole('complementary', { name: 'Rectangle properties' })).toBeNull()
  })

  it('keeps local property overrides on component instances', () => {
    const { getByLabelText, getByText, getAllByText } = render(<App />)
    fireEvent.keyDown(window, { key: '˚', code: 'KeyK', metaKey: true, altKey: true })
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD', metaKey: true })

    fireEvent.change(getByLabelText('Corner radius'), { target: { value: '24' } })
    fireEvent.blur(getByLabelText('Corner radius'))
    fireEvent.click(getAllByText('Rectangle')[0])
    fireEvent.change(getByLabelText('Corner radius'), { target: { value: '8' } })
    fireEvent.blur(getByLabelText('Corner radius'))
    fireEvent.click(getByText('Rectangle instance'))

    expect(getByLabelText('Corner radius')).toHaveValue('24')
    fireEvent.click(getByLabelText('Reset corner radius override'))
    expect(getByLabelText('Corner radius')).toHaveValue('8')

    fireEvent.change(getByLabelText('Corner radius'), { target: { value: '20' } })
    fireEvent.blur(getByLabelText('Corner radius'))
    fireEvent.click(getByLabelText('Instance options'))
    fireEvent.click(getByText('Reset instance'))
    expect(getByLabelText('Corner radius')).toHaveValue('8')
  })

  it('creates and selects circles with the O tool', () => {
    const { getByRole, getByText } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.keyDown(window, { key: 'o' })
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 180, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 180, pointerId: 1 })
    expect(context.ellipse).toHaveBeenCalledWith(160, 140, 60, 40, 0, 0, Math.PI * 2)
    expect(getByText('Circle 2')).toBeInTheDocument()
    expect(getByRole('complementary', { name: 'Circle properties' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates frames that contain, clip, and move their children', () => {
    const { getByRole, getByText, getAllByText } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.pointerDown(canvas, { clientX: 250, clientY: 190, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 550, clientY: 410, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 550, clientY: 410, pointerId: 1 })
    expect(getByText('Frame 2')).toBeInTheDocument()
    expect(getByRole('complementary', { name: 'Frame properties' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Clip frame content' })).toHaveAttribute('aria-pressed', 'true')
    expect(getByRole('button', { name: 'Horizontal frame flow' })).toHaveAttribute('aria-pressed', 'true')
    expect(getByRole('textbox', { name: 'Width' })).toHaveValue('260')
    expect(getByRole('textbox', { name: 'Height' })).toHaveValue('180')
    expect(getByRole('textbox', { name: 'Gap' })).toHaveValue('10')
    expect(getByRole('textbox', { name: 'Padding' })).toHaveValue('10')
    expect(getByRole('button', { name: 'Align frame top left' })).toHaveAttribute('aria-pressed', 'true')
    expect(context.clip).toHaveBeenCalled()
    expect(getAllByText('Rectangle')[0].parentElement).toHaveStyle({ marginLeft: '16px' })

    const scrubber = getByRole('button', { name: 'Scrub X position' })
    fireEvent.pointerDown(scrubber, { clientX: 100, pointerId: 2, buttons: 1 })
    fireEvent.pointerMove(scrubber, { clientX: 120, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(scrubber, { clientX: 120, pointerId: 2 })
    expect(context.fillRect).toHaveBeenCalledWith(280, 200, 240, 160)
  })

  it('keeps the drawn dimensions when an auto-layout frame is empty', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 140, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 150, clientY: 140, pointerId: 1 })
    expect(getByRole('textbox', { name: 'Width' })).toHaveValue('100')
    expect(getByRole('textbox', { name: 'Height' })).toHaveValue('90')
  })

  it('lays out frame children using the selected flow', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 100, y: 100, width: 300, height: 300,
            fill: '#FFFFFF', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 5, padding: 10 },
          { id: 'one', name: 'One', type: 'rectangle', x: 0, y: 0, width: 50, height: 50,
            fill: '#111111', visible: true, parentId: 'frame' },
          { id: 'two', name: 'Two', type: 'rectangle', x: 0, y: 0, width: 40, height: 40,
            fill: '#222222', visible: true, parentId: 'frame' },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Vertical frame flow' }))
    expect(context.fillRect).toHaveBeenCalledWith(110, 110, 50, 50)
    expect(context.fillRect).toHaveBeenCalledWith(110, 165, 40, 40)
  })

  it('reorders auto-layout children while they are dragged', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'second', selectedElementIds: ['second'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 100, y: 100, width: 120, height: 80,
            fill: '#FFFFFF', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10 },
          { id: 'first', name: 'First', type: 'rectangle', x: 110, y: 110, width: 40, height: 40,
            fill: '#111111', visible: true, parentId: 'frame' },
          { id: 'second', name: 'Second', type: 'rectangle', x: 160, y: 110, width: 50, height: 40,
            fill: '#222222', visible: true, parentId: 'frame' },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 185, clientY: 130, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 105, clientY: 130, pointerId: 1, buttons: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(110, 110, 50, 40)
    expect(context.fillRect).toHaveBeenCalledWith(170, 110, 40, 40)
  })

  it('detaches a child dragged outside and preserves the empty frame size', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'child', selectedElementIds: ['child'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 100, y: 100, width: 100, height: 60,
            fill: '#FFFFFF', visible: true, clipContent: true, layoutMode: 'vertical', gap: 10, padding: 10 },
          { id: 'child', name: 'Child', type: 'rectangle', x: 110, y: 110, width: 40, height: 40,
            fill: '#111111', visible: true, parentId: 'frame' },
        ],
      }],
    }))
    const { getByRole, getByText } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 130, clientY: 130, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 300, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 300, pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(280, 280, 40, 40)
    expect(getByText('Child').parentElement).toHaveStyle({ marginLeft: '0px' })
    fireEvent.click(getByText('Frame'))
    expect(getByRole('textbox', { name: 'Height' })).toHaveValue('60')
  })

  it('highlights a frame while an element is dragged over it', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 200, height: 160,
            fill: '#FFFFFF', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10 },
          { id: 'item', name: 'Item', type: 'rectangle', x: 100, y: 100, width: 40, height: 40,
            fill: '#111111', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    context.stroke.mockClear()
    context.fillRect.mockClear()
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 380, clientY: 260, pointerId: 1, buttons: 1 })
    expect(context.stroke.mock.calls.length).toBeGreaterThanOrEqual(5)
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 200, 160)
    expect(context.fillRect).not.toHaveBeenCalledWith(300, 200, 60, 60)
    fireEvent.pointerUp(canvas, { clientX: 380, clientY: 260, pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 60, 60)
  })

  it('drops an element into a frame based on overlap even when the pointer remains outside', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'item', selectedElementIds: ['item'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 200, height: 160,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
          { id: 'item', name: 'Item', type: 'rectangle', x: 100, y: 100, width: 100, height: 40,
            fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 290, clientY: 251, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 290, clientY: 251, pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 120, 60)
    expect(context.fillRect).toHaveBeenCalledWith(310, 210, 100, 40)
  })

  it('shows a frame name and moves the frame by dragging its label', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: null, selectedElementIds: [], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame 7', type: 'frame', x: 300, y: 200, width: 200, height: 160,
            fill: '#FFFFFF', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
        ],
      }],
    }))
    const { getByLabelText, getByRole, getByText } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    expect(context.fillText).toHaveBeenCalledWith('Frame 7', 300, 196)
    fireEvent.pointerDown(canvas, { clientX: 305, clientY: 185, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 355, clientY: 225, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 355, clientY: 225, pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(350, 240, 200, 160)
    fireEvent.doubleClick(canvas, { clientX: 355, clientY: 225 })
    expect(getByLabelText('Frame name')).toHaveStyle({ left: '350px', top: '222px', height: '18px', fontSize: '11px' })
    fireEvent.change(getByLabelText('Frame name'), { target: { value: 'Header' } })
    fireEvent.keyDown(getByLabelText('Frame name'), { key: 'Enter' })
    expect(getByText('Header')).toBeInTheDocument()
  })

  it('adjusts uniform frame padding from any canvas-side handle', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 200, height: 160,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 210, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 220, pointerId: 1, buttons: 1 })
    expect(getByRole('textbox', { name: 'Padding' })).toHaveValue('20')
    expect(context.fillText).toHaveBeenCalledWith('20', 400, 179)
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 220, pointerId: 1 })
  })

  it('keeps a resized auto-layout frame fixed while respecting flow and alignment', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 60, height: 60,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'center', alignY: 'center' },
          { id: 'child', parentId: 'frame', name: 'Child', type: 'rectangle', x: 310, y: 210,
            width: 40, height: 40, fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 360, clientY: 260, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 260, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 260, pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 200, 60)
    expect(context.fillRect).toHaveBeenCalledWith(380, 210, 40, 40)
  })

  it('switches frame dimensions between fixed and hug and distributes an automatic gap', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 200, height: 60,
            fixedWidth: true, fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal',
            gap: 10, padding: 10, alignX: 'start', alignY: 'start' },
          { id: 'first', parentId: 'frame', name: 'First', type: 'rectangle', x: 310, y: 210,
            width: 40, height: 40, fill: '#ddd', visible: true },
          { id: 'second', parentId: 'frame', name: 'Second', type: 'rectangle', x: 360, y: 210,
            width: 40, height: 40, fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Gap sizing options' }))
    fireEvent.click(getByRole('button', { name: 'Auto' }))
    expect(context.fillRect).toHaveBeenCalledWith(450, 210, 40, 40)
    fireEvent.click(getByRole('button', { name: 'Width sizing options' }))
    fireEvent.click(getByRole('button', { name: /Hug contents/ }))
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 100, 60)
    expect(context.fillText).toHaveBeenCalledWith('100 Hug × 60', 350, 281)
  })

  it('fills the available width for a child inside auto layout', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'child', selectedElementIds: ['child'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 200, height: 60,
            fixedWidth: true, fixedHeight: true, fill: '#fff', visible: true, clipContent: true,
            layoutMode: 'horizontal', gap: 10, padding: 10, alignX: 'start', alignY: 'start' },
          { id: 'child', parentId: 'frame', name: 'Child', type: 'rectangle', x: 310, y: 210,
            width: 40, height: 40, fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Width sizing options' }))
    fireEvent.click(getByRole('button', { name: /Fill container/ }))
    expect(context.fillRect).toHaveBeenCalledWith(310, 210, 180, 40)
    expect(context.fillText).toHaveBeenCalledWith('180 Fill × 40', 400, 271)
  })

  it('constrains frame resizing before rendering when min and max dimensions are set', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'frame', selectedElementIds: ['frame'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'frame', name: 'Frame', type: 'frame', x: 300, y: 200, width: 100, height: 80,
            fixedWidth: true, fixedHeight: true, minWidth: 80, maxWidth: 120, minHeight: 60, maxHeight: 100,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    context.fillRect.mockClear()
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 280, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 280, pointerId: 1, buttons: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 120, 80)
    expect(context.fillRect).not.toHaveBeenCalledWith(300, 200, 200, 80)
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 280, pointerId: 1 })
  })

  it('nests frames recursively and lays them out from the inside out', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: 'inner', selectedElementIds: ['inner'], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'outer', name: 'Outer', type: 'frame', x: 300, y: 200, width: 300, height: 300,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
          { id: 'inner', name: 'Inner', type: 'frame', x: 100, y: 100, width: 100, height: 100,
            fill: '#fff', visible: true, clipContent: true, layoutMode: 'horizontal', gap: 10, padding: 10,
            alignX: 'start', alignY: 'start' },
          { id: 'child', parentId: 'inner', name: 'Child', type: 'rectangle', x: 110, y: 110,
            width: 50, height: 50, fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 105, clientY: 85, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 365, clientY: 245, pointerId: 1, buttons: 1 })
    context.fillText.mockClear()
    fireEvent.pointerUp(canvas, { clientX: 365, clientY: 245, pointerId: 1 })
    expect(context.fillText).toHaveBeenCalledWith('Outer', 300, 196)
    expect(context.fillText).not.toHaveBeenCalledWith('Inner', 310, 206)
    expect(context.fillRect).toHaveBeenCalledWith(300, 200, 90, 90)
    expect(context.fillRect).toHaveBeenCalledWith(310, 210, 70, 70)
    expect(context.fillRect).toHaveBeenCalledWith(320, 220, 50, 50)
  })

  it('shows rectangle properties and applies alignment and fill changes', () => {
    const { getByLabelText, getByRole } = render(<App />)
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Align horizontal left' }))
    expect(context.fillRect).toHaveBeenCalledWith(0, 220, 240, 160)
    fireEvent.click(getByRole('button', { name: 'Rectangle fill color' }))
    expect(getByRole('dialog', { name: 'Rectangle fill color picker' })).toBeInTheDocument()
    fireEvent.change(getByLabelText('Rectangle fill'), { target: { value: '#ff0000' } })
    expect(getByLabelText('Rectangle fill')).toHaveValue('#FF0000')
  })

  it('shows canvas properties when nothing is selected and changes its background', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 700, clientY: 550, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 700, clientY: 550, pointerId: 1 })
    expect(getByRole('complementary', { name: 'Canvas properties' })).toBeInTheDocument()
    expect(getByLabelText('Canvas background')).toHaveValue('#E0E0E0')
    fireEvent.change(getByLabelText('Canvas background'), { target: { value: '#8899aa' } })
    expect(getByLabelText('Canvas background')).toHaveValue('#8899AA')
  })

  it('scrubs numeric properties by dragging their leading icon', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const scrubber = getByRole('button', { name: 'Scrub X position' })
    fireEvent.pointerDown(scrubber, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(scrubber, { clientX: 110, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(scrubber, { clientX: 110, pointerId: 1 })
    expect(getByLabelText('X position')).toHaveValue('290')
  })

  it('rotates the selection frame with its rectangle', () => {
    const { getByRole } = render(<App />)
    context.rotate.mockClear()
    const scrubber = getByRole('button', { name: 'Scrub Rotation' })
    fireEvent.pointerDown(scrubber, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(scrubber, { clientX: 115, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(scrubber, { clientX: 115, pointerId: 1 })
    expect(context.rotate).toHaveBeenCalled()
    expect(context.rotate.mock.calls.every(([angle]) => angle === Math.PI / 12)).toBe(true)
  })

  it('stops scrubbing when the pointer returns without the mouse button pressed', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const scrubber = getByRole('button', { name: 'Scrub X position' })
    fireEvent.pointerDown(scrubber, { clientX: 100, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(scrubber, { clientX: 140, pointerId: 1, buttons: 0 })
    fireEvent.pointerMove(scrubber, { clientX: 180, pointerId: 1, buttons: 0 })
    expect(getByLabelText('X position')).toHaveValue('280')
  })

  it('samples a canvas color with the color picker eyedropper', async () => {
    const open = vi.fn().mockResolvedValue({ sRGBHex: '#3366ff' })
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: class { open = open } })
    const { getByLabelText, getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Rectangle fill color' }))
    fireEvent.click(getByRole('button', { name: 'Pick rectangle fill color from screen' }))
    await waitFor(() => expect(getByLabelText('Rectangle fill')).toHaveValue('#3366FF'))
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper
  })

  it('adds configurable drop and inner shadow effects', () => {
    const { getAllByRole, getByLabelText, getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Add effect' }))
    fireEvent.click(getByRole('button', { name: 'Add drop shadow' }))
    expect(getByLabelText('drop-shadow settings')).toBeInTheDocument()
    fireEvent.click(getAllByRole('button', { name: 'Dismiss' })[0])
    fireEvent.click(getByRole('button', { name: 'Add effect' }))
    fireEvent.click(getByRole('button', { name: 'Add inner shadow' }))
    expect(getByLabelText('inner-shadow settings')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('eve.canvas.document.v1') ?? '{}')
    expect(stored.layers[0].elements[0].effects.map((effect: { type: string }) => effect.type))
      .toEqual(['drop-shadow', 'inner-shadow'])
  })

  it('draws a rectangle into the active layer', () => {
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Rectangle' }))
    fireEvent.click(getByRole('button', { name: 'Rectangle' }))
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 120, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 200, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(100, 120, 120, 80)
    expect(getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('writes text on the canvas and drags it', () => {
    const { getByLabelText, getByRole, getByText } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Text' }))
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Hello world' } })
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    expect(getByText('Hello world')).toBeInTheDocument()
    expect(context.fillText).toHaveBeenCalledWith('Hello world', 120, 140)

    fireEvent.click(getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(canvas, { clientX: 130, clientY: 150, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 170, clientY: 170, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 170, clientY: 170, pointerId: 2 })
    expect(context.fillText).toHaveBeenCalledWith('Hello world', 160, 160)
  })

  it('commits text and returns to select when clicking outside its editable area', () => {
    const { getByLabelText, getByRole, getByText, queryByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Outside click' } })
    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 400, pointerId: 2 })
    expect(getByText('Outside click')).toBeInTheDocument()
    expect(() => getByLabelText('Text content')).toThrow()
    expect(getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
    expect(queryByRole('complementary', { name: 'Typography settings' })).not.toBeInTheDocument()
  })

  it('shows typography controls and resizes selected text', () => {
    const { getByLabelText, getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Text' }))
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Hello' } })
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    expect(getByRole('complementary', { name: 'Typography settings' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Text color' })).toBeInTheDocument()
    expect(getByLabelText('Text color hex')).toHaveValue('#171717')
    fireEvent.change(getByLabelText('Font family'), { target: { value: 'Georgia' } })
    fireEvent.click(getByRole('button', { name: 'Align center' }))

    fireEvent.click(getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(canvas, { clientX: 185, clientY: 169, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 205, clientY: 189, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 205, clientY: 189, pointerId: 2 })
    expect(context.strokeRect).toHaveBeenCalledWith(120, 140, 85, 48.80000000000001)
  })

  it('edits an existing text element with a double click', () => {
    const { getByLabelText, getByRole, getByText } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Original' } })
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    fireEvent.click(getByRole('button', { name: 'Select' }))
    fireEvent.doubleClick(canvas, { clientX: 140, clientY: 150 })
    expect(getByLabelText('Text content')).toHaveValue('Original')
    expect((getByLabelText('Text content') as HTMLInputElement).selectionStart).toBe(2)
    const editor = getByLabelText('Text content') as HTMLInputElement
    editor.setSelectionRange(4, 4)
    fireEvent.select(editor)
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Original extended' } })
    expect(context.strokeRect).toHaveBeenCalledWith(120, 140, 221, 28.799999999999997)
    expect(context.fillRect).toHaveBeenCalledWith(341, 140, 1.5, 28.799999999999997)
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    expect(getByText('Original extended')).toBeInTheDocument()
  })

  it('edits an existing text element with a single click without breaking drag', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'One click' } })
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    fireEvent.pointerDown(canvas, { clientX: 145, clientY: 150, pointerId: 2 })
    fireEvent.pointerUp(canvas, { clientX: 145, clientY: 150, pointerId: 2 })
    expect(getByLabelText('Text content')).toHaveValue('One click')
    expect((getByLabelText('Text content') as HTMLInputElement).selectionStart).toBe(2)
  })

  it('selects all text when double clicking during text editing', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    const editor = getByLabelText('Text content') as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'Select all' } })
    fireEvent.doubleClick(canvas, { clientX: 150, clientY: 150 })
    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe('Select all'.length)
    expect(context.fillRect).toHaveBeenCalledWith(120, 140, 130, 28.799999999999997)
    editor.setSelectionRange(3, 3)
    fireEvent.keyDown(editor, { key: 'a', metaKey: true })
    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe('Select all'.length)
  })

  it('selects a text range by dragging while editing', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    const editor = getByLabelText('Text content') as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'Select range' } })
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 150, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 185, clientY: 150, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 185, clientY: 150, pointerId: 2 })
    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe(5)
  })

  it('adjusts the rectangle corner radius with its circular handle', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    expect(context.fillText).not.toHaveBeenCalledWith('Radius 0', expect.any(Number), expect.any(Number))
    expect(context.arc).not.toHaveBeenCalled()
    fireEvent.pointerMove(canvas, { clientX: 292, clientY: 232, pointerId: 1, buttons: 1 })
    expect(context.arc).toHaveBeenCalled()
    expect(canvas.style.cursor).toContain('data:image/svg+xml')
    expect(canvas.style.cursor).toContain('ew-resize')
    fireEvent.pointerDown(canvas, { clientX: 292, clientY: 232, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 310, clientY: 232, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 310, clientY: 232, pointerId: 1 })
    expect(context.roundRect).toHaveBeenCalledWith(280, 220, 240, 160, 18)
    expect(context.fillText).toHaveBeenCalledWith('Radius 18', 299, 206)
  })

  it('reflows text when its box becomes narrower without scaling the font', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Text' }))
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 140, pointerId: 1 })
    fireEvent.change(getByLabelText('Text content'), { target: { value: 'Hola mundo' } })
    fireEvent.keyDown(getByLabelText('Text content'), { key: 'Enter' })
    fireEvent.click(getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(canvas, { clientX: 250, clientY: 168.8, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 168.8, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 168.8, pointerId: 2 })
    expect(context.fillText).toHaveBeenCalledWith('Hola', 120, 140)
    expect(context.fillText).toHaveBeenCalledWith('mundo', 120, 168.8)
    expect(context.strokeRect).toHaveBeenCalledWith(120, 140, 80, 57.599999999999994)
  })

  it('copies and pastes selected elements with command shortcuts', () => {
    const { getByText } = render(<App />)
    fireEvent.keyDown(window, { key: 'c', metaKey: true })
    fireEvent.keyDown(window, { key: 'v', metaKey: true })
    expect(getByText('Rectangle copy')).toBeInTheDocument()
    expect(context.fillRect).toHaveBeenCalledWith(300, 240, 240, 160)
  })

  it('cuts and pastes the selected element in front', () => {
    const { getByText, queryByText } = render(<App />)
    fireEvent.keyDown(window, { key: 'x', metaKey: true })
    expect(queryByText('Rectangle')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'v', metaKey: true })
    expect(getByText('Rectangle copy')).toBeInTheDocument()
    expect(context.fillRect).toHaveBeenCalledWith(300, 240, 240, 160)
  })

  it('opens an element context menu and applies its actions', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.contextMenu(canvas, { clientX: 400, clientY: 300 })
    expect(getByRole('menu', { name: 'Element actions' })).toBeInTheDocument()
    expect(getByRole('menuitem', { name: /Bring to front/ })).toBeInTheDocument()
    expect(getByRole('menuitem', { name: /Send to back/ })).toBeInTheDocument()
    fireEvent.click(getByRole('menuitem', { name: /Lock/ }))
    expect(getByRole('button', { name: 'Unlock Rectangle' })).toBeInTheDocument()
  })

  it('selects enclosed elements with a marquee', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 250, clientY: 190, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 550, clientY: 410, pointerId: 1, buttons: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(250, 190, 300, 220)
    fireEvent.pointerUp(canvas, { clientX: 550, clientY: 410, pointerId: 1 })
    expect(getByRole('button', { name: 'Hide Rectangle' }).parentElement).toHaveClass('bg-blue-50')
    expect(context.fillText).toHaveBeenCalledWith('240 × 160', 400, 401)
  })

  it('selects variable-sized elements using their visible marquee bounds', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: null, selectedElementIds: [], variableModes: { theme: 'light' },
      variableCollections: [{ id: 'theme', name: 'Theme', modes: [{ id: 'light', name: 'Light' }],
        variables: [{ id: 'size', name: 'Size', type: 'number', values: { light: 100 } }] }],
      layers: [{ id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
        { id: 'round', name: 'Round', type: 'rectangle', x: 100, y: 100, width: 500, height: 500,
          radius: 50, fill: '#555555', visible: true, variableBindings: { width: 'size', height: 'size' } },
      ] }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 90, clientY: 90, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 210, clientY: 210, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 210, clientY: 210, pointerId: 1 })
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
  })

  it('moves a multi-selection as one group', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.click(getByRole('button', { name: 'Rectangle' }))
    fireEvent.click(getByRole('button', { name: 'Rectangle' }))
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 150, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.click(getByRole('button', { name: 'Select' }))
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 550, clientY: 420, pointerId: 2, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 550, clientY: 420, pointerId: 2 })
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 180, pointerId: 3 })
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 200, pointerId: 3, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 200, pointerId: 3 })
    expect(context.fillRect).toHaveBeenCalledWith(120, 120, 50, 50)
    expect(context.fillRect).toHaveBeenCalledWith(300, 240, 240, 160)
  })

  it('adds and removes elements from the selection with Shift click', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      activeElementId: null, selectedElementIds: [], layers: [{
        id: 'layer', name: 'Main layer', expanded: true, visible: true, elements: [
          { id: 'first', name: 'First', type: 'rectangle', x: 100, y: 100, width: 40, height: 40,
            fill: '#ddd', visible: true },
          { id: 'second', name: 'Second', type: 'rectangle', x: 260, y: 100, width: 40, height: 40,
            fill: '#ddd', visible: true },
        ],
      }],
    }))
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 120, pointerId: 1 })
    fireEvent.pointerDown(canvas, { clientX: 280, clientY: 120, pointerId: 2, buttons: 1, shiftKey: true })
    expect(context.strokeRect).toHaveBeenCalledWith(100, 100, 200, 40)
    fireEvent.pointerDown(canvas, { clientX: 280, clientY: 120, pointerId: 3, buttons: 1, shiftKey: true })
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
  })

  it('opens the non-destructive version history panel', async () => {
    const { getByRole, findByRole, queryByRole } = render(<App />)
    expect(getByRole('complementary', { name: 'Rectangle properties' })).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Version history' }))
    expect(await findByRole('dialog', { name: 'Canvas history' })).toBeInTheDocument()
    expect(queryByRole('complementary', { name: 'Rectangle properties' })).not.toBeInTheDocument()
    expect(getByRole('heading', { name: 'Version history' }).parentElement).toHaveClass('h-14', 'shrink-0', 'px-3.5')
  })

  it('deletes selected elements with the delete key', () => {
    const { getByRole, getAllByText, queryByText } = render(<App />)
    expect(getAllByText('Rectangle')).not.toHaveLength(0)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(queryByText('Rectangle')).not.toBeInTheDocument()
    expect(getByRole('img', { name: 'Editor canvas' })).toBeInTheDocument()
  })

  it('renames layers and elements with a double click', () => {
    const { getByLabelText, getByText, getAllByText } = render(<App />)
    fireEvent.doubleClick(getByText('Main layer'))
    fireEvent.change(getByLabelText('Layer name'), { target: { value: 'Interface' } })
    fireEvent.keyDown(getByLabelText('Layer name'), { key: 'Enter' })
    expect(getByText('Interface')).toBeInTheDocument()
    fireEvent.doubleClick(getAllByText('Rectangle')[0])
    fireEvent.change(getByLabelText('Element name'), { target: { value: 'Card' } })
    fireEvent.keyDown(getByLabelText('Element name'), { key: 'Enter' })
    expect(getByText('Card')).toBeInTheDocument()
  })

  it('restores the canvas document from local storage', () => {
    const first = render(<App />)
    const canvas = first.getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 440, clientY: 320, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    first.unmount()
    vi.clearAllMocks()
    render(<App />)
    expect(context.fillRect).toHaveBeenCalledWith(320, 240, 240, 160)
  })

  it('recovers from an invalid stored document with no layers', () => {
    localStorage.setItem('eve.canvas.document.v1', JSON.stringify({
      layers: [], activeElementId: null, selectedElementIds: [],
    }))
    const { getByText, getAllByText } = render(<App />)
    expect(getByText('Main layer')).toBeInTheDocument()
    expect(getAllByText('Rectangle')).not.toHaveLength(0)
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 240, 160)
  })

  it('zooms the viewport around the pointer with command and wheel', () => {
    const { getByLabelText, getByRole, unmount } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    expect(getByLabelText('Current zoom')).toHaveTextContent('100%')
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: -100, metaKey: true })
    expect(context.scale).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number))
    expect(context.scale.mock.calls.at(-1)?.[0]).toBeGreaterThan(1)
    const stored = JSON.parse(localStorage.getItem('eve.canvas.viewport.v1') ?? '{}')
    expect(stored.zoom).toBeGreaterThan(1)
    expect(getByLabelText('Current zoom')).toHaveTextContent(`${Math.round(stored.zoom * 100)}%`)
    unmount()
    context.scale.mockClear()
    render(<App />)
    expect(context.scale).toHaveBeenLastCalledWith(stored.zoom, stored.zoom)
  })

  it('hides canvas dimension labels at very distant zoom levels', () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    context.fillText.mockClear()
    for (let step = 0; step < 4; step += 1) {
      fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 100, metaKey: true })
    }
    expect(getByLabelText('Current zoom')).toHaveTextContent('10%')
    context.fillText.mockClear()
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 0, metaKey: true })
    expect(context.fillText).not.toHaveBeenCalledWith('240 × 160', expect.any(Number), expect.any(Number))
  })

  it('hides rounded handles below fifty percent zoom', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 100, metaKey: true })
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 100, metaKey: true })
    context.arc.mockClear()
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 300, pointerId: 1 })
    expect(context.arc).not.toHaveBeenCalled()
  })

  it('pans with the wheel while the select tool is active', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    expect(fireEvent.wheel(canvas, { deltaX: 120, deltaY: 20 })).toBe(false)
    expect(context.translate).toHaveBeenLastCalledWith(-120, -20)
  })

  it('pans with the wheel while the hand tool is active', () => {
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Hand' }))
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.wheel(canvas, { deltaX: 50, deltaY: 30 })
    expect(context.translate).toHaveBeenLastCalledWith(-50, -30)
  })

  it('shows inherited visibility on child elements', () => {
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Hide layer' }))
    expect(getByRole('button', { name: 'Show Rectangle' })).toBeInTheDocument()
  })

  it('inherits a layer lock and protects its elements from deletion', () => {
    const { getByRole, getByText } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Lock layer' }))
    expect(getByRole('button', { name: 'Rectangle locked by layer' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(getByText('Rectangle')).toBeInTheDocument()
  })

  it('locks an individual element against canvas dragging', () => {
    const { getByRole } = render(<App />)
    fireEvent.click(getByRole('button', { name: 'Lock Rectangle' }))
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 450, clientY: 330, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 450, clientY: 330, pointerId: 1 })
    expect(context.fillRect).not.toHaveBeenCalledWith(330, 250, 240, 160)
  })

  it('moves the rectangle by dragging it', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 450, clientY: 330, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(330, 250, 240, 160)
  })

  it('undoes and redoes a complete drag as one action', async () => {
    const { getByLabelText, getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('eve.canvas.history.v1') ?? '[]')).toHaveLength(1), { timeout: 1000 })
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 450, clientY: 330, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { clientX: 450, clientY: 330, pointerId: 1 })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('eve.canvas.history.v1') ?? '[]')).toHaveLength(2), { timeout: 1000 })
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(getByLabelText('X position')).toHaveValue('280')
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
    expect(getByLabelText('X position')).toHaveValue('330')
  })

  it('resizes from the south-east handle', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 520, clientY: 380, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 560, clientY: 410, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 280, 190)
  })

  it('preserves the initial aspect ratio while resizing with shift', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.pointerDown(canvas, { clientX: 520, clientY: 380, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 580, clientY: 390, pointerId: 1, shiftKey: true, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 300, 200)
  })

  it('cancels a canvas resize when the pointer returns with the mouse released', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    context.fillRect.mockClear()
    fireEvent.pointerDown(canvas, { clientX: 520, clientY: 380, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 560, clientY: 410, pointerId: 1, buttons: 0 })
    fireEvent.pointerMove(canvas, { clientX: 600, clientY: 440, pointerId: 1, buttons: 1 })
    expect(context.fillRect).not.toHaveBeenCalledWith(280, 220, 320, 220)
  })

  it('pans the viewport with space and drag without moving the element', () => {
    const { getByRole } = render(<App />)
    const canvas = getByRole('img', { name: 'Editor canvas' })
    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 130, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    fireEvent.keyUp(window, { code: 'Space' })
    expect(context.translate).toHaveBeenLastCalledWith(50, 30)
    expect(context.fillRect).toHaveBeenCalledWith(280, 220, 240, 160)
  })
})
