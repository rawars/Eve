import type { CanvasDocument, CanvasElement, CanvasVariable, FrameElement, VariableCollection, VariableValue } from './types'

export const DEFAULT_THEME_COLLECTION: VariableCollection = {
  id: 'theme', name: 'Theme', global: true,
  modes: [{ id: 'theme-light', name: 'Light' }, { id: 'theme-dark', name: 'Dark' }], variables: [],
}

export function globalVariableCollection(document: CanvasDocument) {
  return document.variableCollections?.find((collection) => collection.global)
    ?? document.variableCollections?.find((collection) => collection.name.trim().toLowerCase() === 'theme')
}

export function ensureThemeDocument(document: CanvasDocument): CanvasDocument {
  const collections = document.variableCollections ?? []
  if (!collections.length) return { ...document, variableCollections: [DEFAULT_THEME_COLLECTION],
    variableModes: { ...(document.variableModes ?? {}), [DEFAULT_THEME_COLLECTION.id]: DEFAULT_THEME_COLLECTION.modes[0].id } }
  const global = globalVariableCollection(document) ?? collections[0]
  return { ...document, variableCollections: collections.map((collection) => ({ ...collection, global: collection.id === global.id })),
    variableModes: { ...(document.variableModes ?? {}), [global.id]: document.variableModes?.[global.id] ?? global.modes[0]?.id } }
}

export function globalVariableModes(document: CanvasDocument) {
  const collection = globalVariableCollection(document)
  if (!collection) return {}
  return { [collection.id]: document.variableModes?.[collection.id] ?? collection.modes[0]?.id }
}

export function variableById(document: CanvasDocument, id: string): CanvasVariable | undefined {
  return document.variableCollections?.flatMap((collection) => collection.variables).find((variable) => variable.id === id)
}

export function resolveVariable(document: CanvasDocument, id: string, modes = globalVariableModes(document), seen = new Set<string>()): VariableValue | undefined {
  if (seen.has(id)) return undefined
  seen.add(id)
  for (const collection of document.variableCollections ?? []) {
    const variable = collection.variables.find((item) => item.id === id)
    if (!variable) continue
    const modeId = modes[collection.id] ?? collection.modes[0]?.id
    const value = variable.values[modeId]
    return typeof value === 'object' && value && 'aliasTo' in value
      ? resolveVariable(document, value.aliasTo, modes, seen) : value
  }
}

export function resolveElementVariables(document: CanvasDocument, element: CanvasElement, modes = globalVariableModes(document)): CanvasElement {
  let resolved: CanvasElement = element
  for (const [property, variableId] of Object.entries(element.variableBindings ?? {})) {
    const value = resolveVariable(document, variableId, modes)
    if (value === undefined || typeof value === 'object') continue
    resolved = { ...resolved, [property]: value } as CanvasElement
  }
  return resolved
}

export function resolvedVariableDocument(document: CanvasDocument): CanvasDocument {
  const elements = document.layers.flatMap((layer) => layer.elements)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const variables = new Map<string, { variable: CanvasVariable; collection: VariableCollection }>()
  for (const collection of document.variableCollections ?? []) for (const variable of collection.variables) {
    variables.set(variable.id, { variable, collection })
  }
  const resolve = (id: string, modes: Record<string, string>, seen = new Set<string>()): VariableValue | undefined => {
    if (seen.has(id)) return undefined
    seen.add(id)
    const entry = variables.get(id)
    if (!entry) return undefined
    const modeId = modes[entry.collection.id] ?? entry.collection.modes[0]?.id
    const value = entry.variable.values[modeId]
    return typeof value === 'object' && value && 'aliasTo' in value ? resolve(value.aliasTo, modes, seen) : value
  }
  const modesFor = (element: CanvasElement) => {
    const frames: FrameElement[] = []
    let current: CanvasElement | undefined = element
    while (current) {
      if (current.type === 'frame') frames.unshift(current)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return frames.reduce((modes, frame) => ({ ...modes, ...frame.variableModes }), globalVariableModes(document))
  }
  let documentChanged = false
  const layers = document.layers.map((layer) => {
    let layerChanged = false
    const resolved = layer.elements.map((element) => {
      const bindings = Object.entries(element.variableBindings ?? {})
      if (!bindings.length) return element
      let next: CanvasElement = element
      const modes = modesFor(element)
      for (const [property, variableId] of bindings) {
        const value = resolve(variableId, modes)
        if (value === undefined || typeof value === 'object' || (element as unknown as Record<string, unknown>)[property] === value) continue
        next = { ...next, [property]: value } as CanvasElement
      }
      if (next !== element) layerChanged = true
      return next
    })
    if (!layerChanged) return layer
    documentChanged = true
    return { ...layer, elements: resolved }
  })
  return documentChanged ? { ...document, layers } : document
}

function blendHexColor(from: string, to: string, progress: number) {
  const normalize = (color: string) => {
    const hex = color.replace('#', '')
    return hex.length === 3 ? hex.split('').map((part) => part.repeat(2)).join('') : hex
  }
  const fromHex = normalize(from)
  const toHex = normalize(to)
  if (!/^[0-9a-f]{6}$/i.test(fromHex) || !/^[0-9a-f]{6}$/i.test(toHex)) return to
  const channel = (offset: number) => Math.round(Number.parseInt(fromHex.slice(offset, offset + 2), 16)
    + (Number.parseInt(toHex.slice(offset, offset + 2), 16) - Number.parseInt(fromHex.slice(offset, offset + 2), 16)) * progress)
  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, '0')).join('')}`
}

export function blendResolvedVariableColors(from: CanvasDocument, to: CanvasDocument, progress: number): CanvasDocument {
  const fromElements = new Map(from.layers.flatMap((layer) => layer.elements).map((element) => [element.id, element]))
  return { ...to, layers: to.layers.map((layer) => ({ ...layer, elements: layer.elements.map((element) => {
    const previous = fromElements.get(element.id)
    if (!previous || !('fill' in previous) || !('fill' in element) || previous.fill === element.fill) return element
    return { ...element, fill: blendHexColor(previous.fill, element.fill, progress) }
  }) })) }
}
