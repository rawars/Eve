import { describe, expect, it } from 'vitest'
import type { CanvasDocument } from './types'
import { blendResolvedVariableColors, ensureThemeDocument, resolvedVariableDocument } from './variables'
import { findTopElementAtPoint } from './layers'

describe('variable modes', () => {
  it('resolves a bound value using the globally active collection mode', () => {
    const document: CanvasDocument = {
      activeElementId: null, selectedElementIds: [], variableModes: { theme: 'dark' },
      variableCollections: [{ id: 'theme', name: 'Theme', modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
        variables: [{ id: 'surface', name: 'Surface', type: 'color', values: { light: '#ffffff', dark: '#111111' } }] }],
      layers: [{ id: 'layer', name: 'Main', expanded: true, visible: true, elements: [
        { id: 'card', name: 'Card', type: 'rectangle', x: 0, y: 0, width: 100, height: 100,
          fill: '#ffffff', visible: true, variableBindings: { fill: 'surface' } },
      ] }],
    }

    const resolved = resolvedVariableDocument(document).layers[0].elements[0]
    expect(resolved.type === 'rectangle' ? resolved.fill : undefined).toBe('#111111')
  })

  it('interpolates resolved colors without changing variable bindings', () => {
    const base: CanvasDocument = { activeElementId: null, selectedElementIds: [], layers: [{ id: 'layer', name: 'Layer', expanded: true, visible: true,
      elements: [{ id: 'card', name: 'Card', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, fill: '#000000', visible: true, variableBindings: { fill: 'surface' } }] }] }
    const target = { ...base, layers: [{ ...base.layers[0], elements: [{ ...base.layers[0].elements[0], fill: '#ffffff' }] }] } as CanvasDocument
    const blended = blendResolvedVariableColors(base, target, 0.5)
    expect(blended.layers[0].elements[0]).toMatchObject({ fill: '#808080', variableBindings: { fill: 'surface' } })
  })

  it('creates Theme as the default global collection', () => {
    const document = ensureThemeDocument({ activeElementId: null, selectedElementIds: [], layers: [] })
    expect(document.variableCollections?.[0]).toMatchObject({ id: 'theme', name: 'Theme', global: true })
    expect(document.variableModes).toEqual({ theme: 'theme-light' })
  })

  it('inherits frame scopes and lets the nearest frame override its ancestors', () => {
    const document: CanvasDocument = {
      activeElementId: null, selectedElementIds: [], variableModes: { theme: 'light', brand: 'warm' },
      variableCollections: [
        { id: 'theme', name: 'Theme', global: true, modes: [{ id: 'light', name: 'Light' }], variables: [] },
        { id: 'brand', name: 'Brand', modes: [{ id: 'warm', name: 'Warm' }, { id: 'cool', name: 'Cool' }],
          variables: [{ id: 'accent', name: 'Accent', type: 'color', values: { warm: '#ff0000', cool: '#0000ff' } }] },
      ],
      layers: [{ id: 'layer', name: 'Main', expanded: true, visible: true, elements: [
        { id: 'outer', name: 'Outer', type: 'frame', x: 0, y: 0, width: 100, height: 100, fill: '#fff', visible: true,
          clipContent: true, layoutMode: 'none', gap: 0, padding: 0, alignX: 'start', alignY: 'start', variableModes: { brand: 'warm' } },
        { id: 'inner', parentId: 'outer', name: 'Inner', type: 'frame', x: 0, y: 0, width: 80, height: 80, fill: '#fff', visible: true,
          clipContent: true, layoutMode: 'none', gap: 0, padding: 0, alignX: 'start', alignY: 'start', variableModes: { brand: 'cool' } },
        { id: 'card', parentId: 'inner', name: 'Card', type: 'rectangle', x: 0, y: 0, width: 20, height: 20,
          fill: '#fff', visible: true, variableBindings: { fill: 'accent' } },
      ] }],
    }
    const resolved = resolvedVariableDocument(document).layers[0].elements.find((element) => element.id === 'card')
    expect(resolved?.type === 'rectangle' ? resolved.fill : undefined).toBe('#0000ff')
  })

  it('uses resolved variable dimensions for canvas hit testing', () => {
    const document: CanvasDocument = {
      activeElementId: 'shape', selectedElementIds: ['shape'], variableModes: { theme: 'light' },
      variableCollections: [{ id: 'theme', name: 'Theme', global: true, modes: [{ id: 'light', name: 'Light' }],
        variables: [{ id: 'width', name: 'Width', type: 'number', values: { light: 100 } }] }],
      layers: [{ id: 'layer', name: 'Main', expanded: true, visible: true, elements: [
        { id: 'shape', name: 'Shape', type: 'rectangle', x: 0, y: 0, width: 500, height: 100,
          radius: 50, fill: '#fff', visible: true, variableBindings: { width: 'width' } },
      ] }],
    }
    const layers = resolvedVariableDocument(document).layers
    expect(findTopElementAtPoint(layers, { x: 80, y: 50 })?.id).toBe('shape')
    expect(findTopElementAtPoint(layers, { x: 250, y: 50 })).toBeUndefined()
  })
})
