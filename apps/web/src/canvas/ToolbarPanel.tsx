import { IconBox, IconBraces, IconChevronDown, IconCircle, IconComponents, IconDownload, IconHandStop, IconHistory, IconLetterT, IconPointer, IconRectangle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { tv } from 'tailwind-variants'

const toolButton = tv({
  base: 'grid size-8 place-items-center rounded-lg text-neutral-600 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:text-neutral-300',
  variants: { active: { true: 'bg-blue-500 text-white hover:bg-blue-600' } },
})

export type Tool = 'select' | 'hand' | 'frame' | 'rectangle' | 'circle' | 'text'

const tools = [
  { id: 'select', label: 'Select', icon: IconPointer },
  { id: 'hand', label: 'Hand', icon: IconHandStop },
  { id: 'frame', label: 'Frame', icon: IconBox },
  { id: 'text', label: 'Text', icon: IconLetterT },
]

export function ToolbarPanel({ activeTool, onToolChange, onDownload, onHistory, onVariables, onAssets }: {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  onDownload: () => void
  onHistory: () => void
  onVariables: () => void
  onAssets: () => void
}) {
  const [selectedShape, setSelectedShape] = useState<'rectangle' | 'circle'>('rectangle')
  useEffect(() => {
    if (activeTool === 'rectangle' || activeTool === 'circle') setSelectedShape(activeTool)
  }, [activeTool])
  const ShapeIcon = selectedShape === 'rectangle' ? IconRectangle : IconCircle
  const shapeLabel = selectedShape === 'rectangle' ? 'Rectangle' : 'Circle'

  return <nav aria-label="Canvas tools" className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.10)]">
    {tools.map((tool) => <Button key={tool.id} aria-label={tool.label}
      aria-pressed={activeTool === tool.id} className={toolButton({ active: activeTool === tool.id })}
      onPress={() => onToolChange(tool.id as Tool)}><tool.icon size={18} stroke={1.8} /></Button>)}
    <DialogTrigger>
      <Button aria-label={shapeLabel} aria-pressed={activeTool === 'rectangle' || activeTool === 'circle'}
        className={`${toolButton({ active: activeTool === 'rectangle' || activeTool === 'circle' })} relative`}>
        <ShapeIcon size={18} stroke={1.8} /><IconChevronDown size={9} stroke={2} className="absolute bottom-0.5 right-0.5" />
      </Button>
      <Popover placement="bottom" offset={7} className="w-36 rounded-[10px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none">
        <Dialog aria-label="Shape tools" className="outline-none">{({ close }) => <div role="menu" className="space-y-0.5">
          {([['rectangle', 'Rectangle', IconRectangle], ['circle', 'Circle', IconCircle]] as const).map(([shape, label, Icon]) =>
            <Button key={shape} onPress={() => { setSelectedShape(shape); onToolChange(shape); close() }}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs outline-none hover:bg-neutral-100 focus-visible:bg-blue-50 ${selectedShape === shape ? 'text-blue-600' : 'text-neutral-700'}`}>
              <Icon size={16} stroke={1.8} />{label}
            </Button>)}
        </div>}</Dialog>
      </Popover>
    </DialogTrigger>
    <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />
    <Button aria-label="Download canvas JSON" className={toolButton()} onPress={onDownload}>
      <IconDownload size={18} stroke={1.8} />
    </Button>
    <Button aria-label="Version history" className={toolButton()} onPress={onHistory}>
      <IconHistory size={18} stroke={1.8} />
    </Button>
    <Button aria-label="Variables" className={toolButton()} onPress={onVariables}>
      <IconBraces size={18} stroke={1.8} />
    </Button>
    <Button aria-label="Assets" className={toolButton()} onPress={onAssets}>
      <IconComponents size={18} stroke={1.8} />
    </Button>
  </nav>
}
