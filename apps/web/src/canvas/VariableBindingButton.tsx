import { IconCheck, IconChevronDown, IconGripHorizontal, IconSearch, IconVariable, IconX } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import type { CanvasVariable, VariableType } from './types'

export function VariableBindingButton({ label, type, variables, value, onChange, menuItem = false, badge = false, previewValue }: {
  label: string; type: VariableType; variables: CanvasVariable[]; value?: string
  onChange: (variableId?: string) => void; menuItem?: boolean; badge?: boolean; previewValue?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({ x: Math.max(16, window.innerWidth - 320), y: 72 })
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const compatible = variables.filter((variable) => variable.type === type
    && variable.name.toLowerCase().includes(search.trim().toLowerCase()))
  const selectedVariable = variables.find((variable) => variable.id === value)

  return <>
    {menuItem ? <Button onPress={() => setPickerOpen(true)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-neutral-700 hover:bg-purple-50 hover:text-purple-700"><IconVariable size={15} />Apply variable</Button>
      : badge && value ? <span className="flex h-7 w-full items-center overflow-hidden rounded-md bg-neutral-200 text-neutral-700">
        <Button aria-label={`Change ${label} variable`} onPress={() => setPickerOpen(true)} className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-[11px] font-semibold hover:bg-neutral-300">
          {type === 'color' && previewValue && <span role="img" aria-label={`${label} color preview`} className="size-3.5 shrink-0 rounded-[3px] border border-black/15 shadow-sm transition-colors duration-200 ease-out" style={{ backgroundColor: previewValue }} />}
          <IconVariable size={13} className="shrink-0 text-purple-600" /><span className="min-w-0 flex-1 truncate">{selectedVariable?.name ?? 'Variable'}</span>
        </Button>
        <Button aria-label={`Detach ${label} variable`} onPress={() => onChange()} className="grid h-full w-7 shrink-0 place-items-center border-l border-neutral-300 text-neutral-500 hover:bg-neutral-300 hover:text-neutral-900"><IconX size={12} /></Button>
      </span> : <DialogTrigger>
      <Button aria-label={`${label} options`} className={`grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-opacity hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 ${value ? 'bg-purple-50 text-purple-600 opacity-100' : 'text-neutral-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
        <IconChevronDown size={14} stroke={1.8} />
      </Button>
      <Popover placement="bottom end" offset={6} className="w-44 rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
        <Dialog className="outline-none">{({ close }) => <div>
          {value && <Button onPress={() => { onChange(); close() }} className="flex h-8 w-full items-center rounded-lg px-2 text-left text-xs text-neutral-600 hover:bg-neutral-100">Detach variable</Button>}
          <Button onPress={() => { close(); setPickerOpen(true) }} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-neutral-700 hover:bg-purple-50 hover:text-purple-700"><IconVariable size={15} />Apply variable</Button>
        </div>}</Dialog>
      </Popover>
    </DialogTrigger>}
    {pickerOpen && <div role="dialog" aria-label={`${label} variable picker`} className="fixed z-[100] w-72 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-white shadow-[0_16px_48px_rgba(0,0,0,0.35)]" style={{ left: position.x, top: position.y }}>
      <div className="flex h-9 cursor-grab items-center border-b border-neutral-700 px-2 active:cursor-grabbing"
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y }; event.currentTarget.setPointerCapture?.(event.pointerId) }}
        onPointerMove={(event) => { if (drag.current) setPosition({ x: Math.max(0, drag.current.left + event.clientX - drag.current.x), y: Math.max(0, drag.current.top + event.clientY - drag.current.y) }) }}
        onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <IconGripHorizontal size={16} className="mr-2 text-neutral-500" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">Apply variable · {label}</span>
        <Button aria-label="Close variable picker" onPress={() => setPickerOpen(false)} className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"><IconX size={15} /></Button>
      </div>
      <div className="p-2"><label className="flex h-8 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-2"><IconSearch size={14} className="text-neutral-400" />
        <input autoFocus aria-label="Search variables" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-neutral-500" />
      </label></div>
      <div className="max-h-72 overflow-y-auto px-1.5 pb-1.5">
        {compatible.map((variable) => <Button key={variable.id} onPress={() => { onChange(variable.id); setPickerOpen(false) }} className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-neutral-800 ${value === variable.id ? 'text-purple-300' : 'text-neutral-200'}`}>
          <IconVariable size={14} className="text-neutral-500" /><span className="min-w-0 flex-1 truncate">{variable.name}</span>{value === variable.id && <IconCheck size={14} />}
        </Button>)}
        {!compatible.length && <p className="px-2 py-6 text-center text-xs text-neutral-500">No compatible variables.</p>}
      </div>
    </div>}
  </>
}
