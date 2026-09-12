import { renderCanvas, type RenderTextDraft } from './render'
import { SpatialIndex } from './spatialIndex'
import type { CanvasDocument, CanvasElement } from './types'

const TILE_SCREEN_SIZE = 512
const TILE_GUTTER = 128
const MAX_TILES = 48
const MAX_TILE_BYTES = 96 * 1024 * 1024
type Viewport = { x: number; y: number; zoom: number }
type CachedTile = { canvas: HTMLCanvasElement; fingerprint: string; bytes: number }

const objectTokens = new WeakMap<object, number>()
let nextObjectToken = 1
function token(value: object) {
  const existing = objectTokens.get(value)
  if (existing) return existing
  const created = nextObjectToken++
  objectTokens.set(value, created)
  return created
}

export class CanvasTileRenderer {
  private readonly cache = new Map<string, CachedTile>()
  private cachedBytes = 0

  clear() { this.cache.clear(); this.cachedBytes = 0 }

  render(context: CanvasRenderingContext2D, document: CanvasDocument, width: number, height: number,
    pixelRatio: number, viewport: Viewport, index: SpatialIndex, sceneElements: CanvasElement[],
    textDraft: RenderTextDraft | undefined, imageRevision: number, onImageLoad: () => void) {
    const worldSize = TILE_SCREEN_SIZE / viewport.zoom
    const left = -viewport.x / viewport.zoom
    const top = -viewport.y / viewport.zoom
    const right = left + width / viewport.zoom
    const bottom = top + height / viewport.zoom
    const firstX = Math.floor(left / worldSize); const lastX = Math.floor(right / worldSize)
    const firstY = Math.floor(top / worldSize); const lastY = Math.floor(bottom / worldSize)
    context.clearRect(0, 0, width, height)
    for (let tileY = firstY; tileY <= lastY; tileY += 1) for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      const worldX = tileX * worldSize; const worldY = tileY * worldSize
      const gutterWorld = TILE_GUTTER / viewport.zoom
      const candidates = index.query({ x: worldX - gutterWorld, y: worldY - gutterWorld,
        width: worldSize + gutterWorld * 2, height: worldSize + gutterWorld * 2 })
      const fingerprint = `${document.background}|${viewport.zoom}|${imageRevision}|${textDraft?.elementId ?? ''}|${candidates.map(token).join('.')}`
      const key = `${tileX}:${tileY}:${viewport.zoom}:${pixelRatio}`
      let tile = this.cache.get(key)
      if (!tile || tile.fingerprint !== fingerprint) {
        if (tile) this.cachedBytes -= tile.bytes
        const canvas = globalThis.document.createElement('canvas')
        const bufferedSize = TILE_SCREEN_SIZE + TILE_GUTTER * 2
        canvas.width = Math.ceil(bufferedSize * pixelRatio)
        canvas.height = Math.ceil(bufferedSize * pixelRatio)
        const tileContext = canvas.getContext('2d')
        // Some constrained/test canvas implementations expose one shared context
        // for every canvas. Rendering offscreen there would corrupt the visible pass.
        if (!tileContext || tileContext === context) return false
        tileContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        renderCanvas(tileContext, document, bufferedSize, bufferedSize,
          { x: TILE_GUTTER - worldX * viewport.zoom, y: TILE_GUTTER - worldY * viewport.zoom, zoom: viewport.zoom }, null,
          textDraft, null, null, onImageLoad, null, null, [], null, null, candidates, sceneElements, 'scene')
        tile = { canvas, fingerprint, bytes: canvas.width * canvas.height * 4 }
        this.cachedBytes += tile.bytes
        this.cache.delete(key); this.cache.set(key, tile)
        while (this.cache.size > MAX_TILES || this.cachedBytes > MAX_TILE_BYTES) {
          const oldestKey = this.cache.keys().next().value
          if (!oldestKey || oldestKey === key && this.cache.size === 1) break
          this.cachedBytes -= this.cache.get(oldestKey)!.bytes
          this.cache.delete(oldestKey)
        }
      } else {
        this.cache.delete(key); this.cache.set(key, tile)
      }
      const screenX = viewport.x + worldX * viewport.zoom
      const screenY = viewport.y + worldY * viewport.zoom
      context.drawImage(tile.canvas, TILE_GUTTER * pixelRatio, TILE_GUTTER * pixelRatio,
        TILE_SCREEN_SIZE * pixelRatio, TILE_SCREEN_SIZE * pixelRatio,
        screenX, screenY, TILE_SCREEN_SIZE, TILE_SCREEN_SIZE)
    }
    return true
  }
}
