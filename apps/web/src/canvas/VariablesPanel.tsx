import { IconCirclePlus, IconColorSwatch, IconHash, IconLetterT, IconPlus, IconSearch, IconToggleLeft, IconTrash, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Button, Input } from 'react-aria-components'
import { ColorControl } from './RectanglePropertiesPanel'
import type { CanvasDocument, CanvasVariable, VariableCollection, VariableType, VariableValue } from './types'

type Props = { document: CanvasDocument; onChange: (document: CanvasDocument) => void; onClose: () => void }
const types: VariableType[] = ['color', 'number', 'string', 'boolean']
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function defaultValue(type: VariableType): VariableValue {
  if (type === 'color') return '#000000'
  if (type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}

export function VariablesPanel({ document, onChange, onClose }: Props) {
  const collections = document.variableCollections ?? []
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [newType, setNewType] = useState<VariableType>('color')
  const collection = collections.find((item) => item.id === collectionId) ?? collections[0]
  const variables = useMemo(() => collection?.variables.filter((variable) =>
    variable.name.toLowerCase().includes(query.toLowerCase())) ?? [], [collection, query])

  function replaceCollection(update: (collection: VariableCollection) => VariableCollection) {
    if (!collection) return
    onChange({ ...document, variableCollections: collections.map((item) => item.id === collection.id ? update(item) : item) })
  }

  function createCollection() {
    const lightId = id('mode')
    const darkId = id('mode')
    const collection: VariableCollection = { id: id('collection'), name: `Collection ${collections.length + 1}`,
      modes: [{ id: lightId, name: 'Light' }, { id: darkId, name: 'Dark' }], variables: [] }
    onChange({ ...document, variableCollections: [...collections, collection] }); setCollectionId(collection.id)
  }

  function deleteCollection() {
    if (!collection || collection.global || !window.confirm(`Delete “${collection.name}” and all its variables?`)) return
    const variableIds = new Set(collection.variables.map((variable) => variable.id))
    const remaining = collections.filter((item) => item.id !== collection.id)
    const variableModes = Object.fromEntries(Object.entries(document.variableModes ?? {})
      .filter(([id]) => id !== collection.id))
    const cleanLayers = (layers: CanvasDocument['layers']) => layers.map((layer) => ({ ...layer, elements: layer.elements.map((element) => ({ ...element,
        variableBindings: Object.fromEntries(Object.entries(element.variableBindings ?? {})
          .filter(([, variableId]) => !variableIds.has(variableId))),
        ...(element.type === 'frame' ? { variableModes: Object.fromEntries(Object.entries(element.variableModes ?? {})
          .filter(([id]) => id !== collection.id)) } : {}),
      })) }))
    onChange({ ...document, variableCollections: remaining, variableModes, layers: cleanLayers(document.layers),
      pages: document.pages?.map((page) => ({ ...page, layers: cleanLayers(page.layers) })) })
    setCollectionId(remaining[0]?.id ?? '')
  }

  function addVariable() {
    if (!collection) return
    const variable: CanvasVariable = { id: id('variable'), name: `${newType} ${collection.variables.length + 1}`,
      type: newType, values: Object.fromEntries(collection.modes.map((mode) => [mode.id, defaultValue(newType)])) }
    replaceCollection((current) => ({ ...current, variables: [...current.variables, variable] }))
  }

  function updateVariable(variableId: string, update: Partial<CanvasVariable>) {
    replaceCollection((current) => ({ ...current, variables: current.variables.map((variable) =>
      variable.id === variableId ? { ...variable, ...update } : variable) }))
  }

  function updateValue(variable: CanvasVariable, modeId: string, raw: string | boolean) {
    const value: VariableValue = variable.type === 'number' ? Number(raw) || 0 : raw
    updateVariable(variable.id, { values: { ...variable.values, [modeId]: value } })
  }

  function addMode() {
    replaceCollection((current) => {
      const mode = { id: id('mode'), name: `Mode ${current.modes.length + 1}` }
      return { ...current, modes: [...current.modes, mode], variables: current.variables.map((variable) => ({ ...variable,
        values: { ...variable.values, [mode.id]: variable.values[current.modes[0].id] ?? defaultValue(variable.type) } })) }
    })
  }

  return <div className="absolute inset-0 z-50 grid place-items-center bg-neutral-900/20 p-8">
    <section aria-label="Variables view" className="flex h-[min(680px,calc(100dvh-4rem))] w-[min(1050px,calc(100vw-4rem))] flex-col overflow-hidden rounded-[14px] border border-neutral-200 bg-white text-neutral-800 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <header className="flex h-14 items-center gap-3 border-b border-neutral-100 px-4">
        <select aria-label="Variable collection" value={collection?.id ?? ''} onChange={(event) => setCollectionId(event.target.value)}
          className="max-w-52 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm font-semibold outline-none focus:border-blue-400">
          {collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Button aria-label="Create collection" onPress={createCollection}
          className="grid size-8 place-items-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500">
          <IconCirclePlus size={18} />
        </Button>
        {collection && !collection.global && <Button aria-label="Delete collection" onPress={deleteCollection}
          className="grid size-8 place-items-center rounded-lg text-neutral-400 outline-none hover:bg-red-50 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-400">
          <IconTrash size={16} />
        </Button>}
        <div className="ml-auto flex h-9 w-64 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-neutral-400">
          <IconSearch size={15} /><Input aria-label="Search variables" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-xs text-neutral-800 outline-none" />
        </div>
        <Button aria-label="Close variables" onPress={onClose} className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"><IconX size={18} /></Button>
      </header>
      {!collection ? <div className="grid flex-1 place-items-center text-center">
        <div><p className="text-sm font-semibold">No variable collections</p><p className="mt-1 text-xs text-neutral-400">Create a collection to define reusable design values.</p>
          <Button onPress={createCollection} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500">Create collection</Button></div>
      </div> : <>
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2">
          <Input aria-label="Collection name" value={collection.name} onChange={(event) => replaceCollection((current) => ({ ...current, name: event.target.value }))}
            className="w-48 bg-transparent text-sm font-semibold outline-none focus:text-blue-400" />
          <select aria-label="New variable type" value={newType} onChange={(event) => setNewType(event.target.value as VariableType)} className="ml-auto rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs outline-none">
            {types.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
          </select>
          <Button aria-label="Add variable" onPress={addVariable} className="flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-500"><IconPlus size={14} />Variable</Button>
          <Button aria-label="Add mode" onPress={addMode} className="flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs hover:bg-neutral-100"><IconPlus size={14} />Mode</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-neutral-50"><tr><th className="w-52 border-b border-r border-neutral-200 px-3 py-3 text-left">Name</th>
              {collection.modes.map((mode) => <th key={mode.id} className="min-w-48 border-b border-r border-neutral-200 px-3 py-2 text-left">
                <Input aria-label={`${mode.name} mode name`} value={mode.name} onChange={(event) => replaceCollection((current) => ({ ...current, modes: current.modes.map((item) => item.id === mode.id ? { ...item, name: event.target.value } : item) }))} className="bg-transparent font-semibold outline-none focus:text-blue-400" />
              </th>)}<th className="w-12 border-b border-neutral-200" /></tr></thead>
            <tbody>{variables.map((variable) => <tr key={variable.id} className="group hover:bg-blue-50/40">
              <td className="border-b border-r border-neutral-200 px-3 py-2"><div className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded text-blue-400">{variable.type === 'color' ? <IconColorSwatch size={14} /> : variable.type === 'number' ? <IconHash size={14} /> : variable.type === 'boolean' ? <IconToggleLeft size={14} /> : <IconLetterT size={14} />}</span>
                <Input aria-label={`${variable.name} variable name`} value={variable.name} onChange={(event) => updateVariable(variable.id, { name: event.target.value })} className="min-w-0 flex-1 bg-transparent outline-none focus:text-blue-400" /></div></td>
              {collection.modes.map((mode) => <td key={mode.id} className="border-b border-r border-neutral-200 px-3 py-2">
                {variable.type === 'boolean' ? <label className="flex items-center gap-2"><input aria-label={`${variable.name} ${mode.name}`} type="checkbox" checked={Boolean(variable.values[mode.id])} onChange={(event) => updateValue(variable, mode.id, event.target.checked)} /><span>{Boolean(variable.values[mode.id]) ? 'True' : 'False'}</span></label>
                  : <div className="flex items-center gap-2">{variable.type === 'color' && <ColorControl label={`${variable.name} ${mode.name} color`} value={String(variable.values[mode.id] ?? '#000000')} onChange={(value) => updateValue(variable, mode.id, value)} />}
                    <Input aria-label={`${variable.name} ${mode.name}`} type={variable.type === 'number' ? 'number' : 'text'} value={String(variable.values[mode.id] ?? '')} onChange={(event) => updateValue(variable, mode.id, event.target.value)} className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" /></div>}
              </td>)}
              <td className="border-b border-neutral-200 px-2"><Button aria-label={`Delete ${variable.name}`} onPress={() => replaceCollection((current) => ({ ...current, variables: current.variables.filter((item) => item.id !== variable.id) }))} className="grid size-7 place-items-center rounded text-neutral-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"><IconTrash size={14} /></Button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </section>
  </div>
}
