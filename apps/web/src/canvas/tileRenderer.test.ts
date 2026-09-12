import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialIndex } from './spatialIndex'
import { CanvasTileRenderer } from './tileRenderer'
import type { CanvasDocument } from './types'

const empty: CanvasDocument = { layers: [], activeElementId: null, selectedElementIds: [], background: '#eee' }

function fakeContext() {
  return { clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
    scale: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D
}

describe('CanvasTileRenderer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reuses unchanged scene tiles when only transient selection changes', () => {
    const tileContext = fakeContext()
    const create = vi.spyOn(globalThis.document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return globalThis.document.createElement(tag)
      return { width: 0, height: 0, getContext: () => tileContext } as unknown as HTMLCanvasElement
    }) as typeof globalThis.document.createElement)
    const renderer = new CanvasTileRenderer()
    const target = fakeContext()
    const index = new SpatialIndex([])
    expect(renderer.render(target, empty, 300, 200, 1, { x: 0, y: 0, zoom: 1 }, index, [], undefined, 0, vi.fn())).toBe(true)
    const created = create.mock.calls.length
    renderer.render(target, { ...empty, selectedElementIds: ['missing'] }, 300, 200, 1,
      { x: 0, y: 0, zoom: 1 }, index, [], undefined, 0, vi.fn())
    expect(create.mock.calls.length).toBe(created)
  })
})
