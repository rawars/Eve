/// <reference types="node" />

import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { updateElement } from '../canvas/layers'
import { packSpatialBoundsBuffer, SpatialIndex } from '../canvas/spatialIndex'
import type { CanvasDocument, RectangleElement } from '../canvas/types'
import { resolvedVariableDocument } from '../canvas/variables'

const sceneSize = Number(process.env.PERF_SCENE_ELEMENTS ?? 100_000)
const boundCount = Number(process.env.PERF_BOUND_COUNT ?? 1_000_000)
const results: Array<{ scenario: string; elements: number; milliseconds: number; detail: string }> = []

function measure<T>(scenario: string, elements: number, detail: string, run: () => T) {
  const started = performance.now()
  const value = run()
  results.push({ scenario, elements, milliseconds: performance.now() - started, detail })
  return value
}

function rectangle(index: number): RectangleElement {
  const columns = 1_000
  return { id: `element-${index}`, name: `Rectangle ${index}`, type: 'rectangle',
    x: index % columns * 32, y: Math.floor(index / columns) * 32,
    width: 24, height: 24, radius: 0, fill: '#000000', visible: true }
}

describe('massive canvas performance budgets', () => {
  it('indexes a large scene and keeps viewport queries bounded', () => {
    const elements = Array.from({ length: sceneSize }, (_, index) => rectangle(index))
    const index = measure('spatial index build', sceneSize, '100 viewport queries', () => new SpatialIndex(elements))
    const hits = measure('spatial viewport queries', sceneSize, '100 viewport queries', () => {
      let total = 0
      for (let query = 0; query < 100; query += 1) {
        total += index.query({ x: query * 97, y: query * 31, width: 1440, height: 900 }).length
      }
      return total
    })
    expect(hits).toBeGreaterThan(0)
    expect(results.at(-2)!.milliseconds).toBeLessThan(5_000)
    expect(results.at(-1)!.milliseconds).toBeLessThan(1_500)
  })

  it('packs one million worker bounds without creating element objects', () => {
    const bounds = new Float64Array(boundCount * 4)
    for (let index = 0; index < boundCount; index += 1) {
      bounds[index * 4] = index % 1_000 * 32
      bounds[index * 4 + 1] = Math.floor(index / 1_000) * 32
      bounds[index * 4 + 2] = 24
      bounds[index * 4 + 3] = 24
    }
    const packed = measure('transferable bounds packing', boundCount, 'compact worker payload',
      () => packSpatialBoundsBuffer(bounds))
    const packedBytes = packed.offsets.byteLength + packed.indices.byteLength + packed.global.byteLength
    results.at(-1)!.detail = `${(packedBytes / 1024 / 1024).toFixed(2)} MiB packed`
    expect(packed.indices.length).toBeGreaterThanOrEqual(boundCount)
    expect(packedBytes).toBeLessThan(boundCount * 12)
    expect(results.at(-1)!.milliseconds).toBeLessThan(12_000)
  })

  it('resolves variables and updates one element in a large document', () => {
    const elements = Array.from({ length: sceneSize }, (_, index) => ({ ...rectangle(index),
      variableBindings: { fill: 'surface' } }))
    const document: CanvasDocument = {
      layers: [{ id: 'main', name: 'Main', expanded: true, visible: true, elements }],
      activeElementId: null, selectedElementIds: [], background: '#ffffff',
      variableCollections: [{ id: 'theme', name: 'Theme', global: true,
        modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
        variables: [{ id: 'surface', name: 'Surface', type: 'color', values: { light: '#ffffff', dark: '#111111' } }] }],
      variableModes: { theme: 'dark' },
    }
    const resolved = measure('variable resolution', sceneSize, 'one bound color per element',
      () => resolvedVariableDocument(document))
    const updated = measure('immutable targeted update', sceneSize, 'one changed element',
      () => updateElement(document.layers, `element-${sceneSize - 1}`, (element) => ({ ...element, x: element.x + 1 })))
    expect((resolved.layers[0].elements[0] as RectangleElement).fill).toBe('#111111')
    expect(updated[0].elements.at(-1)!.x).toBe(elements.at(-1)!.x + 1)
    expect(updated[0].elements[0]).toBe(elements[0])
    expect(results.at(-2)!.milliseconds).toBeLessThan(8_000)
    expect(results.at(-1)!.milliseconds).toBeLessThan(1_000)
  })

  it('prints a compact report', () => {
    const rows = results.map((result) => `${result.scenario.padEnd(30)} ${String(result.elements).padStart(9)}  ${result.milliseconds.toFixed(1).padStart(8)} ms  ${result.detail}`)
    process.stdout.write(`\nMassive scene performance\n${'scenario'.padEnd(30)} ${'elements'.padStart(9)}  ${'time'.padStart(11)}  detail\n${rows.join('\n')}\n\n`)
    expect(results).toHaveLength(5)
  })
})
