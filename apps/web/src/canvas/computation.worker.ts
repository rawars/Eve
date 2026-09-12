import { packSpatialBoundsBuffer } from './spatialIndex'

type VariableRequest = { id: number; kind: 'variables'; collections: Array<{ id: string; modes: Array<{ id: string }>; variables: Array<{ id: string; values: Record<string, unknown> }> }>; modes: Record<string, string>; elements: Array<{ id: string; parentId?: string; type: string; bindings?: Record<string, string>; variableModes?: Record<string, string> }> }
type Request = { id: number; kind: 'spatial-index'; bounds: Float64Array; cellSize: number } | VariableRequest
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void }

scope.onmessage = ({ data }) => {
  if (data.kind === 'variables') {
    const variables = new Map(data.collections.flatMap((collection) => collection.variables.map((variable) => [variable.id, { variable, collection }] as const)))
    const elements = new Map(data.elements.map((element) => [element.id, element]))
    const resolve = (id: string, modes: Record<string, string>, seen = new Set<string>()): unknown => {
      if (seen.has(id)) return undefined; seen.add(id)
      const entry = variables.get(id); if (!entry) return undefined
      const mode = modes[entry.collection.id] ?? entry.collection.modes[0]?.id
      const value = entry.variable.values[mode]
      return value && typeof value === 'object' && 'aliasTo' in value
        ? resolve(String((value as { aliasTo: unknown }).aliasTo), modes, seen) : value
    }
    const patches: Array<[string, Record<string, unknown>]> = []
    for (const element of data.elements) {
      if (!element.bindings) continue
      const scoped = { ...data.modes }; const ancestry = []; let current: typeof element | undefined = element
      while (current) { if (current.type === 'frame') ancestry.unshift(current); current = current.parentId ? elements.get(current.parentId) : undefined }
      ancestry.forEach((frame) => Object.assign(scoped, frame.variableModes))
      const patch: Record<string, unknown> = {}
      Object.entries(element.bindings).forEach(([property, variableId]) => { const value = resolve(variableId, scoped); if (value !== undefined && typeof value !== 'object') patch[property] = value })
      if (Object.keys(patch).length) patches.push([element.id, patch])
    }
    scope.postMessage({ id: data.id, patches }); return
  }
  const packed = packSpatialBoundsBuffer(data.bounds, data.cellSize)
  scope.postMessage({ id: data.id, packed }, [packed.offsets.buffer, packed.indices.buffer, packed.global.buffer])
}

export {}
