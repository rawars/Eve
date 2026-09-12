import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconArrowAutofitContent, IconArrowDown, IconArrowsHorizontal, IconArrowsVertical, IconArrowUp, IconBox, IconCheck, IconChevronDown, IconCircle, IconColorPicker, IconDots, IconDroplet, IconLayoutGrid, IconLayoutDistributeHorizontal, IconLayoutDistributeVertical, IconPlus, IconRectangle, IconRefresh, IconRotate, IconTrash, IconEye, IconEyeOff } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorThumb, Dialog, DialogTrigger, Input, Label, Popover, SliderTrack } from 'react-aria-components'
import { ScrubbableNumberField } from './ScrubbableNumberField'
import { VariableBindingButton } from './VariableBindingButton'
import type { CanvasVariable, CircleElement, FrameElement, RectangleElement, ShadowEffect, VariableCollection, VariableType } from './types'

export type RectangleAlignment = 'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-center' | 'bottom'
export type ShapeUpdate = Partial<Pick<RectangleElement,
  'x' | 'y' | 'width' | 'height' | 'fill' | 'rotation' | 'opacity' | 'effects' | 'radius'>> & {
    clipContent?: boolean
    layoutMode?: FrameElement['layoutMode']
    gap?: number
    padding?: number
    alignX?: FrameElement['alignX']
    alignY?: FrameElement['alignY']
    fixedWidth?: boolean
    fixedHeight?: boolean
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    autoGap?: boolean
    fillWidth?: boolean
    fillHeight?: boolean
    visible?: boolean
    variableModes?: Record<string, string>
  }
type Props = {
  element: RectangleElement | CircleElement | FrameElement
  onChange: (update: ShapeUpdate) => void
  onAlign: (alignment: RectangleAlignment) => void
  onResetOverride?: (property: string) => void
  onResetInstance?: () => void
  onResetOthers?: () => void
  variables?: CanvasVariable[]
  variableCollections?: VariableCollection[]
  onBindVariable?: (property: string, variableId?: string) => void
  onCreateVariant?: () => void
  instanceVariantProperties?: { property: string; value: string; values: string[] }[]
  onSwitchVariantProperty?: (property: string, value: string) => void
  currentVariant?: { properties: { property: string; value: string; values: string[] }[] }
  onChangeVariantProperty?: (previous: string, property: string) => void
  onChangeVariantValue?: (property: string, value: string) => void
  onAddVariantProperty?: () => void
  instanceTextProperties?: { id: string; name: string; value: string }[]
  onChangeInstanceTextProperty?: (id: string, value: string) => void
  insideAutoLayout?: boolean
}

const control = 'h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const iconButton = 'grid h-8 flex-1 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500'

function NumericControl({ label, value, minValue, maxValue, step = 1, onChange, endContent, expandedEndContent }: {
  label: string; value: number; minValue?: number; maxValue?: number; step?: number; onChange: (value: number) => void; endContent?: ReactNode; expandedEndContent?: boolean
}) {
  return <ScrubbableNumberField label={label} value={value} minValue={minValue} maxValue={maxValue} step={step} onChange={onChange} endContent={endContent} expandedEndContent={expandedEndContent} />
}

function DimensionControl({ element, axis, insideAutoLayout, onChange, variableButton, boundVariableButton }: { element: RectangleElement | CircleElement | FrameElement; axis: 'width' | 'height'; insideAutoLayout?: boolean; onChange: (update: ShapeUpdate) => void; variableButton?: ReactNode; boundVariableButton?: ReactNode }) {
  const label = axis === 'width' ? 'Width' : 'Height'
  const value = element[axis]
  const fixedKey = axis === 'width' ? 'fixedWidth' : 'fixedHeight'
  const fillKey = axis === 'width' ? 'fillWidth' : 'fillHeight'
  const minKey = axis === 'width' ? 'minWidth' : 'minHeight'
  const maxKey = axis === 'width' ? 'maxWidth' : 'maxHeight'
  const options = <DialogTrigger>
      <Button aria-label={`${label} sizing options`} className="grid size-8 place-items-center rounded-r-lg text-neutral-500 opacity-0 outline-none hover:bg-neutral-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500">
        <IconChevronDown size={14} />
      </Button>
      <Popover placement="bottom end" offset={6} className="w-48 rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
        <Dialog className="outline-none">{({ close }) => <div className="space-y-0.5 text-xs">
          <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-blue-50 hover:text-blue-700"
            onPress={() => { onChange({ [fixedKey]: true, [fillKey]: false }); close() }}><IconCheck size={14} />Fixed {axis} ({Math.round(value)})</Button>
          {element.type === 'frame' && <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-blue-50 hover:text-blue-700"
            onPress={() => { onChange({ [fixedKey]: false, [fillKey]: false }); close() }}><IconArrowAutofitContent size={14} />Hug contents</Button>}
          {insideAutoLayout && <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-blue-50 hover:text-blue-700"
            onPress={() => { onChange({ [fixedKey]: true, [fillKey]: true }); close() }}><IconArrowsHorizontal size={14} />Fill container</Button>}
          <div className="my-1 border-t border-neutral-100" />
          <Button className="flex h-8 w-full items-center rounded-lg px-2 text-left hover:bg-neutral-50"
            onPress={() => { onChange({ [minKey]: value }); close() }}>Add min {axis}…</Button>
          <Button className="flex h-8 w-full items-center rounded-lg px-2 text-left hover:bg-neutral-50"
            onPress={() => { onChange({ [maxKey]: value }); close() }}>Add max {axis}…</Button>
          <div className="my-1 border-t border-neutral-100" />
          {variableButton}
        </div>}</Dialog>
      </Popover>
    </DialogTrigger>
  const bound = Boolean(element.variableBindings?.[axis])
  return <div className="group min-w-0"><NumericControl label={label} value={value} minValue={1}
    onChange={(next) => onChange({ [axis]: next, [fixedKey]: true, [fillKey]: false })} endContent={bound ? boundVariableButton : options} expandedEndContent={bound} />
  </div>
}

export function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  async function pickScreenColor() {
    const EyeDropper = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!EyeDropper) return
    try {
      const result = await new EyeDropper().open()
      onChange(result.sRGBHex.toUpperCase())
    } catch { /* The user may cancel the eyedropper. */ }
  }

  return <ColorPicker value={value} onChange={(color) => onChange(color.toString('hex').toUpperCase())}>
    <DialogTrigger>
      <Button aria-label={label} className="grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <ColorSwatch className="size-6 rounded border border-neutral-300 shadow-sm" />
      </Button>
      <Popover placement="left" offset={12} className="w-64 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] outline-none">
        <Dialog aria-label={`${label} picker`} className="flex flex-col gap-3 outline-none">
          <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness"
            className="h-40 w-full rounded-xl shadow-inner outline-none">
            <ColorThumb className="size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          </ColorArea>
          <div className="flex items-center gap-2">
            <Button aria-label={`Pick ${label.toLowerCase()} from screen`} onPress={pickScreenColor}
              isDisabled={!('EyeDropper' in window)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35">
              <IconColorPicker size={17} stroke={1.8} />
            </Button>
            <ColorSlider colorSpace="hsb" channel="hue" aria-label="Hue" className="min-w-0 flex-1">
              <SliderTrack className="h-3 w-full rounded-full outline-none">
                <ColorThumb className="top-1/2 size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
              </SliderTrack>
            </ColorSlider>
          </div>
          <ColorField aria-label={`${label} hex`}>
            <Label className="mb-1 block text-[10px] font-medium text-neutral-500">Hex</Label>
            <Input className={control} />
          </ColorField>
        </Dialog>
      </Popover>
    </DialogTrigger>
  </ColorPicker>
}

export function RectanglePropertiesPanel({ element, onChange, onAlign, onResetOverride, onResetInstance, onResetOthers, variables = [], onBindVariable,
  onCreateVariant, instanceVariantProperties = [], onSwitchVariantProperty, currentVariant, onChangeVariantProperty, onChangeVariantValue, onAddVariantProperty,
  instanceTextProperties = [], onChangeInstanceTextProperty, insideAutoLayout, variableCollections = [] }: Props) {
  const shapeName = element.type === 'circle' ? 'Circle' : element.type === 'frame' ? 'Frame' : 'Rectangle'
  const [fillDraft, setFillDraft] = useState(element.fill)
  const [effectsMenuOpen, setEffectsMenuOpen] = useState(false)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  useEffect(() => setFillDraft(element.fill), [element.fill])
  const alignments = [
    ['left', 'Align horizontal left', IconAlignLeft], ['horizontal-center', 'Align horizontal center', IconAlignCenter],
    ['right', 'Align horizontal right', IconAlignRight], ['top', 'Align vertical top', IconArrowUp],
    ['vertical-center', 'Align vertical center', IconArrowsVertical], ['bottom', 'Align vertical bottom', IconArrowDown],
  ] as const

  function addEffect(type: ShadowEffect['type']) {
    const effect: ShadowEffect = { id: `${type}-${Date.now()}`, type, visible: true,
      x: 0, y: 4, blur: 4, spread: 0, color: '#000000', opacity: 0.25 }
    onChange({ effects: [...(element.effects ?? []), effect] })
    setSelectedEffectId(effect.id)
    setEffectsMenuOpen(false)
  }

  function updateEffect(id: string, update: Partial<ShadowEffect>) {
    onChange({ effects: (element.effects ?? []).map((effect) => effect.id === id ? { ...effect, ...update } : effect) })
  }

  const isInstance = Boolean(element.instanceOf || element.componentSourceId)
  const ShapeIcon = element.type === 'circle' ? IconCircle : element.type === 'frame' ? IconBox : IconRectangle
  const variableButton = (property: string, label: string, type: VariableType, menuItem = false, badge = false) => <VariableBindingButton label={label} type={type} variables={variables}
    value={element.variableBindings?.[property]} onChange={(variableId) => onBindVariable?.(property, variableId)} menuItem={menuItem} badge={badge}
    previewValue={type === 'color' && property === 'fill' ? element.fill : undefined} />

  return <aside aria-label={`${shapeName} properties`} className="absolute right-4 top-4 z-10 max-h-[calc(100dvh-2rem)] w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="flex h-11 items-center gap-2 border-b border-neutral-100 px-3.5">
      <ShapeIcon size={16} stroke={1.8} className="shrink-0 text-neutral-400" />
      <h2 className="shrink-0 text-sm font-semibold text-neutral-900">{shapeName}</h2>
      {isInstance && <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-400">{element.name}</span>}
      {!isInstance && <span className="flex-1" />}
      {isInstance && <DialogTrigger>
        <Button aria-label="Instance options" className="grid size-8 place-items-center rounded-lg text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500">
          <IconDots size={17} />
        </Button>
        <Popover placement="bottom end" offset={6} className="w-40 rounded-[10px] border border-neutral-200 bg-white p-1.5 text-neutral-800 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
          <Dialog className="outline-none">{({ close }) => <div className="space-y-0.5 text-xs">
            <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left outline-none hover:bg-neutral-100"
              onPress={() => { onResetInstance?.(); close() }}><IconRefresh size={14} className="text-purple-500" />Reset instance</Button>
            <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left outline-none hover:bg-neutral-100"
              onPress={() => { onResetOthers?.(); close() }}><IconRefresh size={14} className="text-purple-500" />Reset others</Button>
          </div>}</Dialog>
        </Popover>
      </DialogTrigger>}
    </header>
    {(element.component || element.type === 'frame' && element.componentSet || instanceVariantProperties.length > 0 || instanceTextProperties.length > 0) && <section className="border-b border-neutral-100 p-3.5">
      <h2 className="mb-2 text-xs font-semibold text-neutral-900">Component</h2>
      {instanceVariantProperties.length > 0 && <div className="space-y-2">{instanceVariantProperties.map((variant) => <label key={variant.property} className="block text-[10px] font-medium text-neutral-500">{variant.property}
        <select aria-label={`${variant.property} variant`} value={variant.value} onChange={(event) => onSwitchVariantProperty?.(variant.property, event.target.value)} className={`${control} mt-1`}>
          {variant.values.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>)}</div>}
      {instanceTextProperties.length > 0 && <div className={`${instanceVariantProperties.length ? 'mt-3 border-t border-neutral-100 pt-3' : ''} space-y-2`}>
        {instanceTextProperties.map((property) => <label key={property.id} className="block text-[10px] font-medium text-neutral-500">{property.name}
          <input aria-label={`${property.name} text property`} value={property.value}
            onChange={(event) => onChangeInstanceTextProperty?.(property.id, event.target.value)} className={`${control} mt-1`} />
        </label>)}
      </div>}
      {element.component && currentVariant && <div className="mt-2">
        <div className="mb-1.5 text-[10px] font-medium text-neutral-500">Current variant</div>
        <div className="space-y-1.5">{currentVariant.properties.map((variant) => <div key={variant.property} className="grid grid-cols-2 gap-2">
          <input aria-label={`${variant.property} property name`} value={variant.property}
            onChange={(event) => onChangeVariantProperty?.(variant.property, event.target.value)} className={control} />
          <input aria-label={`${variant.property} value`} list={`variant-values-${element.id}-${variant.property}`} value={variant.value}
            onChange={(event) => onChangeVariantValue?.(variant.property, event.target.value)} className={control} />
          <datalist id={`variant-values-${element.id}-${variant.property}`}>{variant.values.map((value) => <option key={value} value={value} />)}</datalist>
        </div>)}</div>
        <Button onPress={onAddVariantProperty} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700"><IconPlus size={13} />Property</Button>
      </div>}
      {(element.component || element.type === 'frame' && element.componentSet) && <Button onPress={onCreateVariant} className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-700 hover:bg-purple-100">
        <IconPlus size={14} />Create variant
      </Button>}
    </section>}
    <section className="border-b border-neutral-100 p-3.5">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Position</h2>
      <span className="text-[10px] font-medium text-neutral-500">Alignment</span>
      <div className="mt-1 grid grid-cols-6 gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        {alignments.map(([value, label, Icon]) => <Button key={value} aria-label={label} className={iconButton}
          onPress={() => onAlign(value)}><Icon size={15} stroke={1.7} /></Button>)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumericControl label="X position" value={element.x} onChange={(x) => onChange({ x })} />
        <NumericControl label="Y position" value={element.y} onChange={(y) => onChange({ y })} />
      </div>
      <div className="mt-2">
        <NumericControl label="Rotation" value={element.rotation ?? 0} minValue={-360} maxValue={360}
          onChange={(rotation) => onChange({ rotation })} />
      </div>
    </section>
    {element.type === 'frame' && <section className="border-b border-neutral-100 p-3.5">
      <h3 className="mb-2 text-xs font-semibold text-neutral-900">Variable scopes</h3>
      <p className="mb-2 text-[10px] leading-4 text-neutral-400">Override collection modes for this frame and its children.</p>
      <div className="space-y-2">{Object.entries(element.variableModes ?? {}).map(([collectionId, modeId]) => {
        const collection = variableCollections.find((item) => item.id === collectionId)
        if (!collection) return null
        return <div key={collectionId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-1.5">
          <div className="flex h-8 items-center truncate rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] font-medium">{collection.name}</div>
          <select aria-label={`${collection.name} frame mode`} value={modeId}
            onChange={(event) => onChange({ variableModes: { ...(element.variableModes ?? {}), [collectionId]: event.target.value } })}
            className="min-w-0 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] outline-none focus:border-blue-400">
            {collection.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
          </select>
          <Button aria-label={`Remove ${collection.name} frame scope`} onPress={() => {
            const modes = { ...(element.variableModes ?? {}) }; delete modes[collectionId]; onChange({ variableModes: modes })
          }} className="grid size-8 place-items-center rounded-lg text-neutral-400 outline-none hover:bg-red-50 hover:text-red-500"><IconTrash size={14} /></Button>
        </div>
      })}</div>
      {variableCollections.some((collection) => collection.modes.length && !element.variableModes?.[collection.id]) && <div className="relative mt-2">
        <select aria-label="Add frame variable scope" value="" onChange={(event) => {
          const collection = variableCollections.find((item) => item.id === event.target.value)
          if (collection?.modes[0]) onChange({ variableModes: { ...(element.variableModes ?? {}), [collection.id]: collection.modes[0].id } })
        }} className="h-8 w-full appearance-none rounded-lg border border-dashed border-neutral-300 bg-white pl-8 pr-7 text-left text-[11px] font-medium text-neutral-600 outline-none hover:bg-neutral-50 focus:border-blue-400">
          <option value="">Add collection…</option>
          {variableCollections.filter((collection) => collection.modes.length && !element.variableModes?.[collection.id]).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select>
        <IconPlus size={14} className="pointer-events-none absolute left-2.5 top-2 text-neutral-400" />
        <IconChevronDown size={13} className="pointer-events-none absolute right-2 top-2 text-neutral-400" />
      </div>}
    </section>}
    <section className="border-b border-neutral-100 p-3.5">
      <h3 className="mb-2 text-xs font-semibold text-neutral-900">Layout</h3>
      {element.type === 'frame' && <>
        <span className="text-[10px] font-medium text-neutral-500">Flow</span>
        <div className="mb-2 mt-1 grid grid-cols-4 gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {([['none', 'Free', IconArrowAutofitContent], ['vertical', 'Vertical', IconLayoutDistributeVertical], ['horizontal', 'Horizontal', IconLayoutDistributeHorizontal], ['grid', 'Grid', IconLayoutGrid]] as const)
            .map(([mode, label, Icon]) => <Button key={mode} aria-label={`${label} frame flow`}
              aria-pressed={element.layoutMode === mode} onPress={() => onChange({ layoutMode: mode })}
              className={`grid h-8 place-items-center rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${element.layoutMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:bg-white'}`}>
              <Icon size={15} stroke={1.8} />
            </Button>)}
        </div>
      </>}
      <div className="grid grid-cols-2 gap-2">
        <DimensionControl element={element} axis="width" insideAutoLayout={insideAutoLayout} onChange={onChange} variableButton={variableButton('width', 'Width', 'number', true)} boundVariableButton={variableButton('width', 'Width', 'number', false, true)} />
        <DimensionControl element={element} axis="height" insideAutoLayout={insideAutoLayout} onChange={onChange} variableButton={variableButton('height', 'Height', 'number', true)} boundVariableButton={variableButton('height', 'Height', 'number', false, true)} />
      </div>
      {element.type === 'frame' && (element.minWidth !== undefined || element.maxWidth !== undefined
        || element.minHeight !== undefined || element.maxHeight !== undefined) && <div className="mt-2 grid grid-cols-2 gap-2">
        {element.minWidth !== undefined && <NumericControl label="Min width" value={element.minWidth} minValue={1}
          onChange={(minWidth) => onChange({ minWidth })} />}
        {element.maxWidth !== undefined && <NumericControl label="Max width" value={element.maxWidth} minValue={1}
          onChange={(maxWidth) => onChange({ maxWidth })} />}
        {element.minHeight !== undefined && <NumericControl label="Min height" value={element.minHeight} minValue={1}
          onChange={(minHeight) => onChange({ minHeight })} />}
        {element.maxHeight !== undefined && <NumericControl label="Max height" value={element.maxHeight} minValue={1}
          onChange={(maxHeight) => onChange({ maxHeight })} />}
      </div>}
      {element.type === 'frame' && <div className="mt-2 grid grid-cols-2 gap-2">
        <NumericControl label="Gap" value={element.gap} minValue={0} onChange={(gap) => onChange({ gap, autoGap: false })} expandedEndContent={Boolean(element.variableBindings?.gap)} endContent={element.variableBindings?.gap
          ? variableButton('gap', 'Gap', 'number', false, true) : <DialogTrigger>
            <Button aria-label="Gap sizing options" className="grid size-8 place-items-center rounded-r-lg text-neutral-500 opacity-0 outline-none hover:bg-neutral-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500">
              <IconChevronDown size={14} />
            </Button>
            <Popover placement="bottom end" offset={6} className="w-36 rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
              <Dialog className="outline-none">{({ close }) => <div className="space-y-0.5 text-xs">
                <Button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-blue-50 hover:text-blue-700"
                  onPress={() => { onChange({ autoGap: false }); close() }}><IconCheck size={14} />{Math.round(element.gap)}</Button>
                <Button className="flex h-8 w-full items-center rounded-lg px-2 text-left hover:bg-blue-50 hover:text-blue-700"
                  onPress={() => { onChange({ autoGap: true }); close() }}>Auto</Button>
                <div className="my-1 border-t border-neutral-100" />
                {variableButton('gap', 'Gap', 'number', true)}
              </div>}</Dialog>
            </Popover>
          </DialogTrigger>} />
        <NumericControl label="Padding" value={element.padding} minValue={0} onChange={(padding) => onChange({ padding })} endContent={variableButton('padding', 'Padding', 'number', false, true)} expandedEndContent={Boolean(element.variableBindings?.padding)} />
      </div>}
      {element.type === 'frame' && <div className="mt-2">
        <span className="text-[10px] font-medium text-neutral-500">Alignment</span>
        <div className="mt-1 grid w-28 grid-cols-3 gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          {(['start', 'center', 'end'] as const).flatMap((alignY, row) =>
            (['start', 'center', 'end'] as const).map((alignX, column) => {
              const vertical = alignY === 'start' ? 'top' : alignY === 'center' ? 'middle' : 'bottom'
              const horizontal = alignX === 'start' ? 'left' : alignX === 'center' ? 'center' : 'right'
              return <Button key={`${alignX}-${alignY}`} aria-label={`Align frame ${vertical} ${horizontal}`}
                aria-pressed={element.alignX === alignX && element.alignY === alignY}
                onPress={() => onChange({ alignX, alignY })}
                className={`grid size-7 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${element.alignX === alignX && element.alignY === alignY ? 'bg-blue-50 text-blue-600' : 'text-neutral-400 hover:bg-white'}`}>
                <span className="size-1 rounded-full bg-current" style={{ gridColumn: column + 1, gridRow: row + 1 }} />
              </Button>
            }))}
        </div>
      </div>}
      {element.type === 'frame' && <div className="mt-2 flex items-center gap-1"><Button aria-label="Clip frame content" aria-pressed={element.clipContent}
        onPress={() => onChange({ clipContent: !element.clipContent })}
        className={`flex h-9 min-w-0 flex-1 items-center justify-between rounded-lg border px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${element.clipContent ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
        Clip content<span>{element.clipContent ? 'On' : 'Off'}</span>
      </Button>{variableButton('clipContent', 'Clip content', 'boolean')}</div>}
    </section>
    <section className="border-b border-neutral-100 p-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-900"><IconEye size={14} />Appearance</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumericControl label="Opacity" value={Math.round((element.opacity ?? 1) * 100)} minValue={0} maxValue={100}
          onChange={(opacity) => onChange({ opacity: opacity / 100 })} endContent={variableButton('opacity', 'Opacity', 'number', false, true)} expandedEndContent={Boolean(element.variableBindings?.opacity)} />
        {element.type !== 'circle' && <div className="relative min-w-0">
          <NumericControl label="Corner radius" value={element.radius ?? 0} minValue={0}
            maxValue={Math.min(element.width, element.height) / 2} onChange={(radius) => onChange({ radius })}
            endContent={variableButton('radius', 'Corner radius', 'number', false, true)} expandedEndContent={Boolean(element.variableBindings?.radius)} />
          {element.overrides?.includes('radius') && <Button aria-label="Reset corner radius override"
            onPress={() => onResetOverride?.('radius')}
            className="absolute right-1 top-[19px] grid size-7 place-items-center rounded-md text-purple-600 outline-none hover:bg-purple-50 focus-visible:ring-2 focus-visible:ring-purple-400">
            <IconRotate size={14} stroke={1.8} />
          </Button>}
        </div>}
      </div>
      <div className="mt-2 flex items-center gap-1"><Button aria-label="Toggle element visibility" onPress={() => onChange({ visible: !element.visible })}
        className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs text-neutral-700">Visibility<span>{element.visible ? 'On' : 'Off'}</span></Button>
        {variableButton('visible', 'Visibility', 'boolean')}</div>
    </section>
    <section className="border-b border-neutral-100 p-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-900"><IconDroplet size={14} />Fill</h3>
      <div className="group flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5">
        {element.variableBindings?.fill ? variableButton('fill', 'Fill', 'color', false, true) : <>
          <ColorControl label={`${shapeName} fill color`} value={element.fill}
            onChange={(fill) => { setFillDraft(fill); onChange({ fill }) }} />
          <input aria-label={`${shapeName} fill`} value={fillDraft}
            onChange={(event) => {
              const fill = event.target.value.toUpperCase()
              setFillDraft(fill)
              if (/^#[0-9A-F]{6}$/.test(fill)) onChange({ fill })
            }}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium uppercase text-neutral-700 outline-none" />
          <IconRotate size={14} className="text-neutral-300" aria-hidden="true" />
          {variableButton('fill', 'Fill', 'color')}
        </>}
      </div>
    </section>
    <section className="p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-neutral-900">Effects</h3>
        <DialogTrigger isOpen={effectsMenuOpen} onOpenChange={setEffectsMenuOpen}>
          <Button aria-label="Add effect" className="grid size-7 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500">
            <IconPlus size={16} />
          </Button>
          <Popover placement="left top" offset={10} className="w-40 rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
            <Dialog aria-label="Effect types" className="outline-none">
              <Button aria-label="Add drop shadow" className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-neutral-700 outline-none hover:bg-neutral-100"
                onPress={() => addEffect('drop-shadow')}><span className="size-3 rounded-sm border border-neutral-400" />Drop shadow</Button>
              <Button aria-label="Add inner shadow" className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-neutral-700 outline-none hover:bg-neutral-100"
                onPress={() => addEffect('inner-shadow')}><span className="size-3 rounded-sm border border-neutral-400 shadow-inner" />Inner shadow</Button>
            </Dialog>
          </Popover>
        </DialogTrigger>
      </div>
      <div className="space-y-1.5">
        {(element.effects ?? []).map((effect) => <div key={effect.id}>
          <div className={`flex h-8 items-center gap-2 rounded-lg border px-2 text-xs ${selectedEffectId === effect.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-neutral-200 text-neutral-700'}`}>
            <DialogTrigger isOpen={selectedEffectId === effect.id}
              onOpenChange={(open) => setSelectedEffectId(open ? effect.id : null)}>
              <Button aria-label={`Edit ${effect.type}`} className="min-w-0 flex-1 truncate text-left outline-none">
                {effect.type === 'drop-shadow' ? 'Drop shadow' : 'Inner shadow'}
              </Button>
              <Popover placement="left" offset={12} className="w-64 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] outline-none">
                <Dialog aria-label={`${effect.type} settings`} className="outline-none">
                  <h4 className="mb-3 text-xs font-semibold text-neutral-900">{effect.type === 'drop-shadow' ? 'Drop shadow' : 'Inner shadow'}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <NumericControl label="Effect X" value={effect.x} onChange={(x) => updateEffect(effect.id, { x })} />
                    <NumericControl label="Effect Y" value={effect.y} onChange={(y) => updateEffect(effect.id, { y })} />
                    <NumericControl label="Effect blur" value={effect.blur} minValue={0} onChange={(blur) => updateEffect(effect.id, { blur })} />
                    <NumericControl label="Effect spread" value={effect.spread} minValue={0} onChange={(spread) => updateEffect(effect.id, { spread })} />
                    <NumericControl label="Effect opacity" value={Math.round(effect.opacity * 100)} minValue={0} maxValue={100}
                      onChange={(opacity) => updateEffect(effect.id, { opacity: opacity / 100 })} />
                    <div className="text-[10px] font-medium text-neutral-500">Effect color
                      <div className="mt-1 flex h-9 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-1.5">
                        <ColorControl label="Effect color" value={effect.color}
                          onChange={(color) => updateEffect(effect.id, { color })} />
                        <span className="ml-1 text-[11px] font-medium text-neutral-700">{effect.color}</span>
                      </div>
                    </div>
                  </div>
                </Dialog>
              </Popover>
            </DialogTrigger>
            <Button aria-label={`${effect.visible ? 'Hide' : 'Show'} ${effect.type}`} className="text-neutral-400 outline-none hover:text-neutral-700"
              onPress={() => updateEffect(effect.id, { visible: !effect.visible })}>
              {effect.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            </Button>
            <Button aria-label={`Remove ${effect.type}`} className="text-neutral-400 outline-none hover:text-red-500"
              onPress={() => { onChange({ effects: (element.effects ?? []).filter((item) => item.id !== effect.id) }); setSelectedEffectId(null) }}>
              <IconTrash size={14} />
            </Button>
          </div>
        </div>)}
        {!(element.effects?.length) && <p className="py-1 text-[11px] text-neutral-400">No effects</p>}
      </div>
    </section>
  </aside>
}
