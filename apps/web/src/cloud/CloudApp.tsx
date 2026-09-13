import type { DesignFile, Project, User } from '@eve/contracts'
import { IconDots, IconEdit, IconFile, IconFolder, IconLogout, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { CanvasEditor } from '../canvas/CanvasEditor'
import type { CanvasDocument } from '../canvas/types'
import { ApiClient, ApiRequestError } from './api'
import { AuthShell } from './AuthShared'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

const EMPTY_DOCUMENT: CanvasDocument = { layers: [], activeElementId: null, selectedElementIds: [], background: '#E0E0E0' }
const FILE_ROUTE = /^\/files\/([^/]+)\/?$/

function routedFileId(pathname = window.location.pathname) {
  const match = pathname.match(FILE_ROUTE)
  return match ? decodeURIComponent(match[1]) : ''
}

function fileRoute(fileId: string) {
  return `/files/${encodeURIComponent(fileId)}`
}

export function CloudApp({ apiUrl }: { apiUrl: string }) {
  const clientRef = useRef(new ApiClient(apiUrl.replace(/\/$/, '')))
  const client = clientRef.current
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [files, setFiles] = useState<DesignFile[]>([])
  const [active, setActive] = useState<{ file: DesignFile; document: CanvasDocument } | null>(null)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState(window.location.pathname)
  const [, setMessage] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  const pendingDocument = useRef<CanvasDocument | null>(null)
  const activeFile = useRef<DesignFile | null>(null)

  const navigate = useCallback((path: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
    setRoute(window.location.pathname)
  }, [])

  const refreshFiles = useCallback(async (projectId: string) => setFiles(projectId ? (await client.listFiles(projectId)).files : []), [client])
  const refreshProjects = useCallback(async () => {
    const next = (await client.listProjects()).projects
    setProjects(next)
    setActiveProjectId((current) => current && next.some(({ id }) => id === current) ? current : next[0]?.id ?? '')
    return next
  }, [client])

  const loadFile = useCallback(async (fileId: string) => {
    setLoading(true)
    try {
      setActive(await client.readFile(fileId))
      setMessage('Saved')
    } finally { setLoading(false) }
  }, [client])

  useEffect(() => {
    void client.me().then(async ({ user: current }) => {
      setUser(current)
      const next = await refreshProjects()
      await refreshFiles(next[0]?.id ?? '')
      const fileId = routedFileId()
      if (fileId) await loadFile(fileId)
      else if (window.location.pathname === '/login' || window.location.pathname === '/register') navigate('/', true)
    })
      .catch(() => {
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          const next = `${window.location.pathname}${window.location.search}`
          navigate(`/login?next=${encodeURIComponent(next)}`, true)
        }
      }).finally(() => setLoading(false))
  }, [client, loadFile, navigate, refreshFiles, refreshProjects])

  useEffect(() => {
    const navigate = () => {
      setRoute(window.location.pathname)
      const fileId = routedFileId()
      if (fileId) void loadFile(fileId)
      else setActive(null)
    }
    window.addEventListener('popstate', navigate)
    return () => window.removeEventListener('popstate', navigate)
  }, [loadFile])

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
    navigate('/login', true)
    setActive(null)
    setUser(null)
    setProjects([])
    setFiles([])
    setMessage('')
  }, [client, navigate, save])

  const renameActiveFile = useCallback(async (name: string) => {
    const file = activeFile.current
    if (!file) return
    const { file: renamed } = await client.renameFile(file.id, name)
    activeFile.current = renamed
    setActive((current) => current ? { ...current, file: renamed } : current)
  }, [client])

  const closeActiveFile = useCallback(async () => {
    await save()
    navigate('/')
    setActive(null)
    await refreshFiles(activeProjectId)
  }, [activeProjectId, navigate, refreshFiles, save])

  if (loading) return <AuthShell><p className="text-sm text-neutral-500">Loading Eve…</p></AuthShell>
  if (!user) {
    const authenticate = async (current: User) => {
      const requested = new URLSearchParams(window.location.search).get('next') || '/'
      navigate(requested, true)
      setUser(current); const next = await refreshProjects(); await refreshFiles(next[0]?.id ?? '')
      const fileId = routedFileId(new URL(requested, window.location.origin).pathname)
      if (fileId) await loadFile(fileId)
    }
    const search = window.location.search
    return route === '/register'
      ? <RegisterPage client={client} onAuthenticated={authenticate} onLogin={() => navigate(`/login${search}`)} />
      : <LoginPage client={client} onAuthenticated={authenticate} onRegister={() => navigate(`/register${search}`)} />
  }
  if (active) return <main className="h-dvh w-dvw overflow-hidden bg-neutral-100">
    <CanvasEditor key={active.file.id} initialDocument={active.document} onDocumentChange={documentChanged}
      fileName={active.file.name} onFileNameChange={renameActiveFile} onBack={closeActiveFile}
      account={{ label: user.email, onLogout: logout }} />
  </main>

  return <FileDashboard user={user} projects={projects} activeProjectId={activeProjectId} files={files}
    onProjectChange={async (projectId) => { setActiveProjectId(projectId); await refreshFiles(projectId) }}
    onProjectCreate={async () => { const name = window.prompt('Project name', 'Untitled project')?.trim(); if (!name) return; const { project } = await client.createProject(name); await refreshProjects(); setActiveProjectId(project.id); await refreshFiles(project.id) }}
    onProjectRename={async (project) => { const name = window.prompt('Project name', project.name)?.trim(); if (!name || name === project.name) return; await client.renameProject(project.id, name); await refreshProjects() }}
    onProjectDelete={async (project) => { if (!window.confirm(`Delete project “${project.name}” and all its files?`)) return; await client.deleteProject(project.id); const next = await refreshProjects(); await refreshFiles(next[0]?.id ?? '') }}
    onOpen={async (file) => { navigate(fileRoute(file.id)); await loadFile(file.id) }}
    onCreate={async () => { if (!activeProjectId) return; const name = window.prompt('File name', 'Untitled')?.trim(); if (!name) return; const { file } = await client.createFile(activeProjectId, name, EMPTY_DOCUMENT); await refreshFiles(activeProjectId); navigate(fileRoute(file.id)); setActive({ file, document: EMPTY_DOCUMENT }) }}
    onDelete={async (file) => { if (!window.confirm(`Delete “${file.name}”?`)) return; await client.deleteFile(file.id); await refreshFiles(activeProjectId) }}
    onLogout={logout} />
}

type DashboardProps = {
  user: User; projects: Project[]; activeProjectId: string; files: DesignFile[]
  onProjectChange(projectId: string): void; onProjectCreate(): void; onProjectRename(project: Project): void; onProjectDelete(project: Project): void
  onOpen(file: DesignFile): void; onCreate(): void; onDelete(file: DesignFile): void; onLogout(): void
}

function FileDashboard({ user, projects, activeProjectId, files, onProjectChange, onProjectCreate, onProjectRename, onProjectDelete, onOpen, onCreate, onDelete, onLogout }: DashboardProps) {
  const activeProject = projects.find(({ id }) => id === activeProjectId)
  return <main className="flex h-dvh overflow-hidden bg-neutral-50">
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
      <div className="mb-7"><h1 className="text-xl font-semibold">Eve</h1><p className="truncate text-xs text-neutral-500">{user.email}</p></div>
      <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Projects</h2><button aria-label="New project" onClick={onProjectCreate} className="rounded p-1 hover:bg-neutral-100"><IconPlus size={16} /></button></div>
      <nav className="space-y-1">{projects.map((project) => <div key={project.id} className={`group flex items-center rounded-lg ${project.id === activeProjectId ? 'bg-neutral-200' : 'hover:bg-neutral-100'}`}>
        <button onClick={() => onProjectChange(project.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"><IconFolder size={16} /><span className="truncate">{project.name}</span></button>
        <DialogTrigger>
          <Button aria-label={`More options for ${project.name}`} className="mr-1 grid size-7 place-items-center rounded-md text-neutral-500 opacity-0 outline-none hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500">
            <IconDots size={16} />
          </Button>
          <Popover placement="bottom end" offset={4} className="w-36 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg outline-none">
            <Dialog aria-label={`Project options for ${project.name}`} className="outline-none">{({ close }) => <div className="space-y-0.5">
              <Button onPress={() => { close(); onProjectRename(project) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:bg-blue-50">
                <IconEdit size={15} /> Edit
              </Button>
              <Button onPress={() => { close(); onProjectDelete(project) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-red-600 outline-none hover:bg-red-50 focus-visible:bg-red-50">
                <IconTrash size={15} /> Delete
              </Button>
            </div>}</Dialog>
          </Popover>
        </DialogTrigger>
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
