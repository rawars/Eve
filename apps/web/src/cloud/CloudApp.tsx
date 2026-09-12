import type { DesignFile, Project, User } from '@eve/contracts'
import { IconArrowLeft, IconFile, IconFolder, IconLogout, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CanvasEditor } from '../canvas/CanvasEditor'
import type { CanvasDocument } from '../canvas/types'
import { ApiClient, ApiRequestError } from './api'
import { turnstileSiteKey } from './config'

const EMPTY_DOCUMENT: CanvasDocument = { layers: [], activeElementId: null, selectedElementIds: [], background: '#E0E0E0' }

export function CloudApp({ apiUrl }: { apiUrl: string }) {
  const clientRef = useRef(new ApiClient(apiUrl.replace(/\/$/, '')))
  const client = clientRef.current
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [files, setFiles] = useState<DesignFile[]>([])
  const [active, setActive] = useState<{ file: DesignFile; document: CanvasDocument } | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  const pendingDocument = useRef<CanvasDocument | null>(null)
  const activeFile = useRef<DesignFile | null>(null)

  const refreshFiles = useCallback(async (projectId: string) => setFiles(projectId ? (await client.listFiles(projectId)).files : []), [client])
  const refreshProjects = useCallback(async () => {
    const next = (await client.listProjects()).projects
    setProjects(next)
    setActiveProjectId((current) => current && next.some(({ id }) => id === current) ? current : next[0]?.id ?? '')
    return next
  }, [client])
  useEffect(() => {
    void client.me().then(async ({ user: current }) => {
      setUser(current)
      const next = await refreshProjects()
      await refreshFiles(next[0]?.id ?? '')
    })
      .catch(() => {}).finally(() => setLoading(false))
  }, [client, refreshFiles, refreshProjects])

  useEffect(() => { activeFile.current = active?.file ?? null }, [active?.file])

  const save = useCallback(async () => {
    const file = activeFile.current
    const document = pendingDocument.current
    if (!file || !document) return
    pendingDocument.current = null
    try {
      const { file: saved } = await client.saveFile(file, document)
      activeFile.current = saved
      setActive((current) => current ? { ...current, file: saved } : current)
      setMessage('Saved')
    } catch (cause) {
      pendingDocument.current = document
      setMessage(cause instanceof ApiRequestError && cause.code === 'REVISION_CONFLICT' ? 'Changed on another device — reload required' : 'Cloud save failed — local copy preserved')
    }
  }, [client])

  const documentChanged = useCallback((document: CanvasDocument) => {
    pendingDocument.current = document
    setMessage('Saving…')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void save() }, 2000)
  }, [save])

  const logout = useCallback(async () => {
    window.clearTimeout(saveTimer.current)
    await save()
    await client.logout()
    pendingDocument.current = null
    activeFile.current = null
    setActive(null)
    setUser(null)
    setProjects([])
    setFiles([])
    setMessage('')
  }, [client, save])

  if (loading) return <Centered><p className="text-sm text-neutral-500">Loading Eve…</p></Centered>
  if (!user) return <AuthScreen client={client} onAuthenticated={async (current) => {
    setUser(current); const next = await refreshProjects(); await refreshFiles(next[0]?.id ?? '')
  }} />
  if (active) return <main className="h-dvh w-dvw overflow-hidden bg-neutral-100">
    <CanvasEditor key={active.file.id} initialDocument={active.document} onDocumentChange={documentChanged} account={{ label: user.email, onLogout: logout }} />
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 shadow-sm">
      <button className="rounded p-1 hover:bg-neutral-100" aria-label="Back to files" onClick={() => { void save(); setActive(null); void refreshFiles(activeProjectId) }}><IconArrowLeft size={16} /></button>
      <span className="max-w-48 truncate text-xs font-medium">{active.file.name}</span>
      <span className="text-[11px] text-neutral-500">{message}</span>
    </div>
  </main>

  return <FileDashboard user={user} projects={projects} activeProjectId={activeProjectId} files={files}
    onProjectChange={async (projectId) => { setActiveProjectId(projectId); await refreshFiles(projectId) }}
    onProjectCreate={async () => { const name = window.prompt('Project name', 'Untitled project')?.trim(); if (!name) return; const { project } = await client.createProject(name); await refreshProjects(); setActiveProjectId(project.id); await refreshFiles(project.id) }}
    onProjectDelete={async (project) => { if (!window.confirm(`Delete project “${project.name}” and all its files?`)) return; await client.deleteProject(project.id); const next = await refreshProjects(); await refreshFiles(next[0]?.id ?? '') }}
    onOpen={async (file) => { setLoading(true); try { setActive(await client.readFile(file.id)); setMessage('Saved') } finally { setLoading(false) } }}
    onCreate={async () => { if (!activeProjectId) return; const { file } = await client.createFile(activeProjectId, 'Untitled', EMPTY_DOCUMENT); await refreshFiles(activeProjectId); setActive({ file, document: EMPTY_DOCUMENT }) }}
    onDelete={async (file) => { if (!window.confirm(`Delete “${file.name}”?`)) return; await client.deleteFile(file.id); await refreshFiles(activeProjectId) }}
    onLogout={async () => { await client.logout(); setUser(null); setProjects([]); setFiles([]) }} />
}

function AuthScreen({ client, onAuthenticated }: { client: ApiClient; onAuthenticated: (user: User) => void | Promise<void> }) {
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  return <Centered><form className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm" onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setError('')
    const action = registering ? client.register(email, password, turnstileToken) : client.login(email, password, turnstileToken)
    void action.then(({ user }) => onAuthenticated(user)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Authentication failed.')).finally(() => setBusy(false))
  }}>
    <h1 className="text-2xl font-semibold">Eve</h1>
    <p className="mb-6 mt-1 text-sm text-neutral-500">{registering ? 'Create your workspace' : 'Continue designing'}</p>
    <label className="mb-4 block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500" /></label>
    <label className="mb-2 block text-sm font-medium">Password<input required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500" /></label>
    {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />}
    {error && <p role="alert" className="my-3 text-sm text-red-600">{error}</p>}
    <button disabled={busy} className="mt-4 w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
    <button type="button" onClick={() => { setRegistering((value) => !value); setError('') }} className="mt-4 w-full text-sm text-neutral-600 hover:text-neutral-950">{registering ? 'Already have an account? Sign in' : 'New to Eve? Create an account'}</button>
  </form></Centered>
}

type DashboardProps = {
  user: User; projects: Project[]; activeProjectId: string; files: DesignFile[]
  onProjectChange(projectId: string): void; onProjectCreate(): void; onProjectDelete(project: Project): void
  onOpen(file: DesignFile): void; onCreate(): void; onDelete(file: DesignFile): void; onLogout(): void
}

function FileDashboard({ user, projects, activeProjectId, files, onProjectChange, onProjectCreate, onProjectDelete, onOpen, onCreate, onDelete, onLogout }: DashboardProps) {
  const activeProject = projects.find(({ id }) => id === activeProjectId)
  return <main className="flex h-dvh overflow-hidden bg-neutral-50">
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
      <div className="mb-7"><h1 className="text-xl font-semibold">Eve</h1><p className="truncate text-xs text-neutral-500">{user.email}</p></div>
      <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Projects</h2><button aria-label="New project" onClick={onProjectCreate} className="rounded p-1 hover:bg-neutral-100"><IconPlus size={16} /></button></div>
      <nav className="space-y-1">{projects.map((project) => <div key={project.id} className={`group flex items-center rounded-lg ${project.id === activeProjectId ? 'bg-neutral-200' : 'hover:bg-neutral-100'}`}>
        <button onClick={() => onProjectChange(project.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"><IconFolder size={16} /><span className="truncate">{project.name}</span></button>
        <button aria-label={`Delete project ${project.name}`} onClick={() => onProjectDelete(project)} className="mr-1 rounded p-1 opacity-0 hover:bg-white group-hover:opacity-100"><IconTrash size={14} /></button>
      </div>)}</nav>
      <button onClick={onLogout} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neutral-100"><IconLogout size={17} /> Sign out</button>
    </aside>
    <section className="min-w-0 flex-1 overflow-auto px-8 py-8"><div className="mx-auto max-w-6xl">
      <div className="mb-7 flex items-center justify-between"><div><p className="text-sm text-neutral-500">Project</p><h2 className="text-2xl font-semibold">{activeProject?.name ?? 'Create a project'}</h2></div><button disabled={!activeProject} onClick={onCreate} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"><IconPlus size={17} /> New file</button></div>
      {!activeProject ? <button onClick={onProjectCreate} className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 text-neutral-500"><IconFolder size={34} /><span className="mt-3 text-sm">Create your first project</span></button>
        : files.length === 0 ? <button onClick={onCreate} className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-500"><IconFile size={32} /><span className="mt-3 text-sm">Create your first design file</span></button>
        : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{files.map((file) => <article key={file.id} className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <button onClick={() => onOpen(file)} className="block w-full text-left"><div className="flex h-40 items-center justify-center bg-neutral-100"><IconFile size={34} className="text-neutral-400" /></div><div className="p-4"><p className="truncate font-medium">{file.name}</p><p className="mt-1 text-xs text-neutral-500">Edited {new Date(file.updatedAt).toLocaleString()}</p></div></button>
          <button aria-label={`Delete ${file.name}`} onClick={() => onDelete(file)} className="absolute right-3 top-3 rounded-md bg-white p-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"><IconTrash size={16} /></button>
        </article>)}</div>}
    </div></section>
  </main>
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let widgetId: string | undefined
    const render = () => {
      if (!container.current || !window.turnstile) return
      widgetId = window.turnstile.render(container.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken('') })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-eve-turnstile]')
    if (existing) {
      if (window.turnstile) render(); else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true; script.defer = true; script.dataset.eveTurnstile = 'true'; script.addEventListener('load', render, { once: true })
      document.head.append(script)
    }
    return () => { if (widgetId && window.turnstile) window.turnstile.remove(widgetId) }
  }, [onToken, siteKey])
  return <div className="mt-4 min-h-16" ref={container} />
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="flex h-dvh w-dvw items-center justify-center bg-neutral-100 p-6">{children}</main>
}
