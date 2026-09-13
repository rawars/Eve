import { IconArrowUp, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover, TextArea } from 'react-aria-components'

export function AiEditPopover({ targetName, left, top, onSubmit }: {
  targetName: string
  left: number
  top: number
  onSubmit: (instruction: string) => Promise<string>
}) {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit() {
    const value = instruction.trim()
    if (!value || busy) return
    setBusy(true); setMessage('')
    try {
      setMessage(await onSubmit(value))
      setInstruction('')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The AI edit could not be applied.')
    } finally { setBusy(false) }
  }

  return <div className="absolute z-30" style={{ left, top }}>
    <DialogTrigger>
      <Button aria-label={`Edit ${targetName} with AI`} className="grid size-7 place-items-center rounded-md border border-purple-200 bg-white text-purple-600 shadow-md outline-none hover:bg-purple-50 focus-visible:ring-2 focus-visible:ring-purple-500">
        <IconSparkles size={16} stroke={1.8} />
      </Button>
      <Popover placement="right top" offset={8} className="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-2 text-white shadow-[0_14px_40px_rgba(0,0,0,0.35)] outline-none">
        <Dialog aria-label={`AI edit for ${targetName}`} className="outline-none">
          <p className="mb-2 px-1 text-[11px] font-semibold text-neutral-300">Edit {targetName} with AI</p>
          <div className="flex items-end gap-2 rounded-lg bg-neutral-800 p-1.5">
            <TextArea autoFocus aria-label="Describe changes" placeholder="Ask for changes"
              value={instruction} onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }}
              className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-neutral-500" />
            <Button aria-label="Apply AI changes" isDisabled={!instruction.trim() || busy} onPress={() => void submit()}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-600 text-white outline-none hover:bg-neutral-500 disabled:opacity-40">
              <IconArrowUp size={16} stroke={2} />
            </Button>
          </div>
          {message && <p role="status" className="px-1 pb-1 pt-2 text-xs text-neutral-300">{message}</p>}
        </Dialog>
      </Popover>
    </DialogTrigger>
  </div>
}
