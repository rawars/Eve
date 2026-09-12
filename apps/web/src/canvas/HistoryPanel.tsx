import { IconHistory, IconRestore, IconX } from '@tabler/icons-react'
import { Button } from 'react-aria-components'
import type { HistoryEntry } from './history'

export function HistoryPanel({ entries, previewId, onPreview, onCancel, onRollback }: {
  entries: HistoryEntry[]; previewId: string | null; onPreview: (entry: HistoryEntry) => void
  onCancel: () => void; onRollback: () => void
}) {
  return <section role="dialog" aria-label="Canvas history" className="absolute right-4 top-4 z-30 flex max-h-[calc(100dvh-2rem)] w-72 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-100 px-3.5">
      <IconHistory size={18} className="shrink-0 text-neutral-500" />
      <h2 className="flex-1 text-sm font-semibold">Version history</h2>
      <Button aria-label="Close history" onPress={onCancel} className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500"><IconX size={17} /></Button>
    </header>
    <div className="flex-1 overflow-y-auto p-2">
      {[...entries].reverse().map((entry, index) => <Button key={entry.id} onPress={() => onPreview(entry)}
        className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${entry.id === previewId ? 'bg-blue-50 text-blue-700' : 'text-neutral-700 hover:bg-neutral-50'}`}>
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${entry.id === previewId ? 'bg-blue-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{entries.length - index}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{entry.label}</span>
          <span className="block text-xs text-neutral-400">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
      </Button>)}
    </div>
    <footer className="shrink-0 border-t border-neutral-100 p-3">
      <Button isDisabled={!previewId} onPress={onRollback} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-sm font-medium text-white outline-none hover:bg-blue-600 disabled:bg-neutral-200 disabled:text-neutral-400 focus-visible:ring-2 focus-visible:ring-blue-500"><IconRestore size={17} /> Confirm rollback</Button>
      <p className="mt-2 text-center text-[11px] leading-4 text-neutral-400">Preview keeps newer versions until rollback is confirmed.</p>
    </footer>
  </section>
}
