import { IconArtboard, IconDroplet } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { ColorControl } from './RectanglePropertiesPanel'

export function CanvasPropertiesPanel({ background, onChange }: { background: string; onChange: (background: string) => void }) {
  const [draft, setDraft] = useState(background)
  useEffect(() => setDraft(background), [background])
  const update = (value: string) => {
    const color = value.toUpperCase(); setDraft(color)
    if (/^#[0-9A-F]{6}$/.test(color)) onChange(color)
  }
  return <aside aria-label="Canvas properties" className="absolute right-4 top-4 z-10 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="flex h-11 items-center gap-2 border-b border-neutral-100 px-3.5"><IconArtboard size={16} stroke={1.8} className="text-neutral-400" /><h2 className="text-sm font-semibold text-neutral-900">Canvas</h2></header>
    <section className="p-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-900"><IconDroplet size={14} />Background</h3>
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5">
        <ColorControl label="Canvas background color" value={background} onChange={update} />
        <input aria-label="Canvas background" value={draft} onChange={(event) => update(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-medium uppercase text-neutral-700 outline-none" />
      </div></section>
  </aside>
}
