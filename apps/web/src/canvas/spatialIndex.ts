import type { CanvasElement, Rectangle } from './types'

const DEFAULT_CELL_SIZE = 512
const MAX_CELLS_PER_ELEMENT = 256
export type PackedSpatialIndex = { keys: string[]; offsets: Int32Array; indices: Int32Array; global: Int32Array }

function intersects(a: Rectangle, b: Rectangle) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x
    && a.y <= b.y + b.height && a.y + a.height >= b.y
}

function cellRange(rectangle: Rectangle, cellSize: number) {
  return {
    left: Math.floor(rectangle.x / cellSize), top: Math.floor(rectangle.y / cellSize),
    right: Math.floor((rectangle.x + rectangle.width) / cellSize),
    bottom: Math.floor((rectangle.y + rectangle.height) / cellSize),
  }
}

export class SpatialIndex {
  private readonly cells = new Map<string, Set<number>>()
  private readonly global = new Set<number>()
  private readonly indexById = new Map<string, number>()
  private readonly bounds: Rectangle[]

  constructor(private readonly elements: CanvasElement[], private readonly cellSize = DEFAULT_CELL_SIZE,
    getBounds: (element: CanvasElement) => Rectangle = renderBounds, packed?: PackedSpatialIndex) {
    this.bounds = elements.map(getBounds)
    if (packed) {
      packed.keys.forEach((key, position) => this.cells.set(key,
        new Set(packed.indices.slice(packed.offsets[position], packed.offsets[position + 1]))))
      packed.global.forEach((index) => this.global.add(index))
      elements.forEach((element, index) => this.indexById.set(element.id, index))
      return
    }
    elements.forEach((element, index) => {
      this.indexById.set(element.id, index)
      const range = cellRange(this.bounds[index], cellSize)
      const cellCount = (range.right - range.left + 1) * (range.bottom - range.top + 1)
      if (cellCount > MAX_CELLS_PER_ELEMENT) { this.global.add(index); return }
      for (let y = range.top; y <= range.bottom; y += 1) for (let x = range.left; x <= range.right; x += 1) {
        const key = `${x}:${y}`
        const bucket = this.cells.get(key) ?? new Set<number>()
        bucket.add(index); this.cells.set(key, bucket)
      }
    })
  }

  query(rectangle: Rectangle) {
    const range = cellRange(rectangle, this.cellSize)
    const candidates = new Set(this.global)
    for (let y = range.top; y <= range.bottom; y += 1) for (let x = range.left; x <= range.right; x += 1) {
      for (const index of this.cells.get(`${x}:${y}`) ?? []) candidates.add(index)
    }
    return [...candidates].sort((a, b) => a - b)
      .filter((index) => intersects(this.bounds[index], rectangle)).map((index) => this.elements[index])
  }

  ordered(ids: ReadonlySet<string>) {
    return [...ids].map((id) => this.indexById.get(id)).filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b).map((index) => this.elements[index])
  }
}

export function packSpatialBounds(bounds: Rectangle[], cellSize = DEFAULT_CELL_SIZE): PackedSpatialIndex {
  return packBounds(bounds.length, (index) => bounds[index], cellSize)
}

/** Packs the transferable x/y/width/height layout used by the computation worker. */
export function packSpatialBoundsBuffer(bounds: Float64Array, cellSize = DEFAULT_CELL_SIZE): PackedSpatialIndex {
  return packBounds(bounds.length / 4, (index) => ({
    x: bounds[index * 4], y: bounds[index * 4 + 1],
    width: bounds[index * 4 + 2], height: bounds[index * 4 + 3],
  }), cellSize)
}

function packBounds(length: number, rectangleAt: (index: number) => Rectangle,
  cellSize: number): PackedSpatialIndex {
  const cells = new Map<string, number[]>(); const global: number[] = []
  for (let index = 0; index < length; index += 1) {
    const rectangle = rectangleAt(index)
    const range = cellRange(rectangle, cellSize)
    const count = (range.right - range.left + 1) * (range.bottom - range.top + 1)
    if (count > MAX_CELLS_PER_ELEMENT) { global.push(index); continue }
    for (let y = range.top; y <= range.bottom; y += 1) for (let x = range.left; x <= range.right; x += 1) {
      const key = `${x}:${y}`; const entries = cells.get(key) ?? []; entries.push(index); cells.set(key, entries)
    }
  }
  const keys = [...cells.keys()]; const offsets = new Int32Array(keys.length + 1)
  let entryCount = 0
  keys.forEach((key, index) => { offsets[index] = entryCount; entryCount += cells.get(key)!.length })
  offsets[keys.length] = entryCount
  const indices = new Int32Array(entryCount); let cursor = 0
  keys.forEach((key) => { for (const index of cells.get(key)!) indices[cursor++] = index })
  return { keys, offsets, indices, global: Int32Array.from(global) }
}

/** Conservative world-space bounds used for render culling. */
export function renderBounds(element: CanvasElement): Rectangle {
  const radians = ('rotation' in element ? (element.rotation ?? 0) : 0) * Math.PI / 180
  const cos = Math.abs(Math.cos(radians)); const sin = Math.abs(Math.sin(radians))
  const width = element.width * cos + element.height * sin
  const height = element.width * sin + element.height * cos
  const centerX = element.x + element.width / 2; const centerY = element.y + element.height / 2
  let left = centerX - width / 2; let top = centerY - height / 2
  let right = centerX + width / 2; let bottom = centerY + height / 2
  const effects = 'effects' in element ? (element.effects ?? []) : []
  for (const effect of effects) {
    if (!effect.visible || effect.type !== 'drop-shadow') continue
    const spread = Math.max(0, effect.spread ?? 0) + Math.max(0, effect.blur ?? 0) * 2
    const offsetX = effect.x ?? 0; const offsetY = effect.y ?? 0
    left = Math.min(left, centerX - width / 2 + offsetX - spread)
    right = Math.max(right, centerX + width / 2 + offsetX + spread)
    top = Math.min(top, centerY - height / 2 + offsetY - spread)
    bottom = Math.max(bottom, centerY + height / 2 + offsetY + spread)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
