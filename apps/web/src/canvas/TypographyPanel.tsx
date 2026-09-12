import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconAlignBoxBottomCenter, IconAlignBoxCenterMiddle, IconAlignBoxTopCenter, IconLetterT, IconVariable } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { ScrubbableNumberField } from './ScrubbableNumberField'
import { ColorControl } from './RectanglePropertiesPanel'
import { VariableBindingButton } from './VariableBindingButton'
import type { CanvasVariable, TextElement } from './types'

type Props = { element: TextElement; onChange: (update: Partial<TextElement>) => void
  variables?: CanvasVariable[]; onBindVariable?: (property: string, variableId?: string) => void
  canExposeComponentProperty?: boolean; onExposeComponentProperty?: (name?: string) => void
  insideAutoLayout?: boolean }

const control = 'h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const iconButton = 'grid h-8 flex-1 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 data-[selected=true]:bg-neutral-200 data-[selected=true]:text-neutral-900'

export function TypographyPanel({ element, onChange, variables = [], onBindVariable,
  canExposeComponentProperty, onExposeComponentProperty, insideAutoLayout }: Props) {
  const [propertyDraft, setPropertyDraft] = useState(element.componentPropertyName ?? element.name)
  useEffect(() => setPropertyDraft(element.componentPropertyName ?? element.name), [element.componentPropertyName, element.name])
  const variableButton = (property: string, label: string, type: 'string' | 'color' | 'number' | 'boolean', badge = false) => <VariableBindingButton label={label} type={type} variables={variables}
    value={element.variableBindings?.[property]} onChange={(variableId) => onBindVariable?.(property, variableId)} badge={badge}
    previewValue={type === 'color' && property === 'fill' ? element.fill : undefined} />
  return <aside aria-label="Typography settings" className="absolute right-4 top-4 z-10 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="flex h-11 items-center gap-2 border-b border-neutral-100 px-3.5">
      <IconLetterT size={16} stroke={1.8} className="text-neutral-400" />
      <h2 className="text-sm font-semibold text-neutral-900">Text</h2>
    </header>
    <div className="space-y-2.5 p-3.5">
      <label className="block text-[10px] font-medium text-neutral-500">Content
        <span className="group mt-1 flex items-center gap-1">
          <input aria-label="Typography content" value={element.text} onChange={(event) => onChange({ text: event.target.value })} className={control} />
          {variableButton('text', 'Content', 'string')}
          {canExposeComponentProperty && <DialogTrigger>
            <Button aria-label="Create text component property" className={`grid size-9 shrink-0 place-items-center rounded-lg outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 ${element.componentPropertyName ? 'bg-purple-50 text-purple-600' : 'text-neutral-500'}`}>
              <IconVariable size={17} stroke={1.8} />
            </Button>
            <Popover placement="left top" offset={10} className="w-64 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] outline-none">
              <Dialog aria-label="Text component property" className="outline-none">{({ close }) => <div>
                <h3 className="mb-3 text-xs font-semibold text-neutral-900">{element.componentPropertyName ? 'Edit text property' : 'Create text property'}</h3>
                <label className="block text-[10px] font-medium text-neutral-500">Name
                  <input autoFocus aria-label="Text property name" value={propertyDraft} onChange={(event) => setPropertyDraft(event.target.value)} className={`${control} mt-1`} />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  {element.componentPropertyName && <Button onPress={() => { onExposeComponentProperty?.(); close() }} className="h-8 rounded-lg px-2.5 text-xs text-red-600 hover:bg-red-50">Remove</Button>}
                  <Button isDisabled={!propertyDraft.trim()} onPress={() => { onExposeComponentProperty?.(propertyDraft.trim()); close() }}
                    className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">Save</Button>
                </div>
              </div>}</Dialog>
            </Popover>
          </DialogTrigger>}
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] font-medium text-neutral-500">Width
          <input aria-label="Text width" type="number" min="1" value={Math.round(element.width)}
            onChange={(event) => onChange({ width: Math.max(1, Number(event.target.value)), autoWidth: false, fillWidth: false })} className={`${control} mt-1`} />
          <select aria-label="Text width sizing" value={element.fillWidth ? 'fill' : element.autoWidth !== false ? 'hug' : 'fixed'}
            onChange={(event) => onChange(event.target.value === 'hug' ? { autoWidth: true, fillWidth: false }
              : event.target.value === 'fill' ? { autoWidth: false, fillWidth: true } : { autoWidth: false, fillWidth: false })}
            className={`${control} mt-1 h-8`}>
            <option value="fixed">Fixed</option><option value="hug">Hug</option>
            {insideAutoLayout && <option value="fill">Fill container</option>}
          </select>
        </label>
        <label className="block text-[10px] font-medium text-neutral-500">Height
          <input aria-label="Text height" type="number" min="1" value={Math.round(element.height)}
            onChange={(event) => onChange({ height: Math.max(1, Number(event.target.value)), autoHeight: false, fillHeight: false })} className={`${control} mt-1`} />
          <select aria-label="Text height sizing" value={element.fillHeight ? 'fill' : element.autoHeight !== false ? 'hug' : 'fixed'}
            onChange={(event) => onChange(event.target.value === 'hug' ? { autoHeight: true, fillHeight: false }
              : event.target.value === 'fill' ? { autoHeight: false, fillHeight: true } : { autoHeight: false, fillHeight: false })}
            className={`${control} mt-1 h-8`}>
            <option value="fixed">Fixed</option><option value="hug">Hug</option>
            {insideAutoLayout && <option value="fill">Fill container</option>}
          </select>
        </label>
      </div>
      <label className="block text-[10px] font-medium text-neutral-500">Font family
        <select aria-label="Font family" value={element.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })} className={`${control} mt-1`}>
          <option>Inter</option><option>Arial</option><option>Georgia</option><option>Courier New</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] font-medium text-neutral-500">Weight
          <select aria-label="Font weight" value={element.fontWeight} onChange={(event) => onChange({ fontWeight: Number(event.target.value) })} className={`${control} mt-1`}>
            <option value="400">Regular</option><option value="500">Medium</option><option value="600">Semi Bold</option><option value="700">Bold</option>
          </select>
        </label>
        <ScrubbableNumberField label="Font size" value={element.fontSize} minValue={8} maxValue={240}
          onChange={(fontSize) => onChange({ fontSize })} endContent={variableButton('fontSize', 'Font size', 'number', true)} expandedEndContent={Boolean(element.variableBindings?.fontSize)} />
      </div>
      <div>
        <span className="text-[10px] font-medium text-neutral-500">Text color</span>
        <div className="group mt-1 flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {element.variableBindings?.fill ? variableButton('fill', 'Text color', 'color', true) : <>
            <ColorControl label="Text color" value={element.fill} onChange={(fill) => onChange({ fill })} />
            <input aria-label="Text color hex" value={element.fill}
              onChange={(event) => onChange({ fill: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-medium uppercase text-neutral-700 outline-none" />
            {variableButton('fill', 'Text color', 'color')}
          </>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScrubbableNumberField label="Line height" value={element.lineHeight} minValue={0.5} maxValue={4} step={0.1}
          onChange={(lineHeight) => onChange({ lineHeight })} endContent={variableButton('lineHeight', 'Line height', 'number', true)} expandedEndContent={Boolean(element.variableBindings?.lineHeight)} />
        <ScrubbableNumberField label="Letter spacing" value={element.letterSpacing} minValue={-20} maxValue={100} step={0.5}
          onChange={(letterSpacing) => onChange({ letterSpacing })} endContent={variableButton('letterSpacing', 'Letter spacing', 'number', true)} expandedEndContent={Boolean(element.variableBindings?.letterSpacing)} />
      </div>
      <div>
        <span className="text-[10px] font-medium text-neutral-500">Alignment</span>
        <div className="mt-1 flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {([['left', IconAlignLeft], ['center', IconAlignCenter], ['right', IconAlignRight]] as const).map(([value, Icon]) =>
            <Button key={value} aria-label={`Align ${value}`} data-selected={element.textAlign === value} className={iconButton} onPress={() => onChange({ textAlign: value })}><Icon size={16} /></Button>)}
        </div>
      </div>
      <div>
        <span className="text-[10px] font-medium text-neutral-500">Vertical alignment</span>
        <div className="mt-1 flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {([['top', IconAlignBoxTopCenter], ['middle', IconAlignBoxCenterMiddle], ['bottom', IconAlignBoxBottomCenter]] as const).map(([value, Icon]) =>
            <Button key={value} aria-label={`Align ${value}`} data-selected={element.verticalAlign === value} className={iconButton} onPress={() => onChange({ verticalAlign: value })}><Icon size={16} /></Button>)}
        </div>
      </div>
    </div>
  </aside>
}
