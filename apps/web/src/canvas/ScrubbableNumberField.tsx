import { IconArrowsHorizontal, IconGripVertical } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Input, NumberField } from 'react-aria-components'
import resizeCursorUrl from '../assets/cursors/resize-east-west.svg?url'

type Props = {
  label: string
  value: number
  minValue?: number
  maxValue?: number
  step?: number
  onChange: (value: number) => void
  endContent?: ReactNode
  expandedEndContent?: boolean
}

const control = 'h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-8 pr-2.5 text-xs text-neutral-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const scrubCursor = `url("${resizeCursorUrl}") 16 16, ew-resize`

export function ScrubbableNumberField({ label, value, minValue, maxValue, step = 1, onChange, endContent, expandedEndContent }: Props) {
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; value: number } | null>(null)
  const precision = `${step}`.split('.')[1]?.length ?? 0

  function stopDragging() {
    drag.current = null
    setDragging(false)
  }

  function finish(event: React.PointerEvent<HTMLElement>) {
    stopDragging()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  useEffect(() => {
    if (!dragging) return
    const cancel = () => stopDragging()
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [dragging])

  return <div className="group relative"><NumberField aria-label={label} value={value} minValue={minValue} maxValue={maxValue} step={step} onChange={onChange}>
    <span className="text-[10px] font-medium text-neutral-500">{label}</span>
    <div className="relative mt-1">
      <button type="button" aria-label={`Scrub ${label}`} tabIndex={-1}
        className={`absolute inset-y-0 left-0 z-10 grid w-8 place-items-center rounded-l-lg outline-none ${dragging ? 'text-blue-600' : 'text-neutral-400 hover:text-neutral-700'}`}
        style={{ cursor: scrubCursor }}
        onPointerDown={(event) => {
          event.preventDefault()
          drag.current = { x: event.clientX, value }
          setDragging(true)
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          if ((event.buttons & 1) === 0) {
            stopDragging()
            return
          }
          const raw = drag.current.value + (event.clientX - drag.current.x) * step
          const clamped = Math.min(maxValue ?? Number.POSITIVE_INFINITY, Math.max(minValue ?? Number.NEGATIVE_INFINITY, raw))
          onChange(Number(clamped.toFixed(precision)))
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={stopDragging}>
        {dragging ? <IconArrowsHorizontal size={15} stroke={1.8} /> : <IconGripVertical size={14} stroke={1.8} />}
      </button>
      <Input className={`${control} ${endContent ? 'pr-9' : ''} ${expandedEndContent ? 'text-transparent caret-transparent' : ''}`} />
    </div>
  </NumberField>{endContent && <span className={`absolute z-10 grid place-items-center ${expandedEndContent ? 'bottom-1 left-8 right-1 h-7' : 'bottom-0 right-0 h-9 w-9'}`}>{endContent}</span>}</div>
}
