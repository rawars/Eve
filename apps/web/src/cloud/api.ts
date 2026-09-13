import type { AiEditResponse, AuthResponse, DesignFile, FileContentResponse, FileListResponse, FileResponse, ProjectListResponse, ProjectResponse } from '@eve/contracts'
import type { CanvasDocument, CanvasElement } from '../canvas/types'

const CLOUD_ASSET_PREFIX = 'r2-asset:'

export class ApiClient {
  constructor(readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
      throw new ApiRequestError(payload?.error?.message ?? `Request failed with status ${response.status}.`, response.status, payload?.error?.code)
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }

  me() { return this.request<AuthResponse>('/auth/me') }
  register(email: string, password: string, turnstileToken?: string) {
    return this.request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, turnstileToken }) })
  }
  login(email: string, password: string, turnstileToken?: string) {
    return this.request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, turnstileToken }) })
  }
  logout() { return this.request<void>('/auth/logout', { method: 'POST' }) }
  listProjects() { return this.request<ProjectListResponse>('/projects') }
  createProject(name: string) { return this.request<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify({ name }) }) }
  renameProject(id: string, name: string) { return this.request<ProjectResponse>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }) }
  deleteProject(id: string) { return this.request<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  listFiles(projectId: string) { return this.request<FileListResponse>(`/files?projectId=${encodeURIComponent(projectId)}`) }
  createFile(projectId: string, name: string, document?: CanvasDocument) {
    return this.request<FileResponse>('/files', { method: 'POST', body: JSON.stringify({ projectId, name, document }) })
  }
  renameFile(id: string, name: string) {
    return this.request<FileResponse>(`/files/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
  }
  generateAiEdit(fileId: string, instruction: string, targetId: string, context: unknown) {
    return this.request<AiEditResponse>(`/files/${encodeURIComponent(fileId)}/ai-edit`, {
      method: 'POST', body: JSON.stringify({ instruction, targetId, context }),
    })
  }
  deleteFile(id: string) { return this.request<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  async readFile(id: string) {
    const result = await this.request<FileContentResponse<CanvasDocument>>(`/files/${encodeURIComponent(id)}/content`)
    return { ...result, document: await hydrateCloudAssets(result.document, id, this) }
  }
  async saveFile(file: DesignFile, document: CanvasDocument) {
    const stored = await storeCloudAssets(document, file.id, this)
    return this.request<FileResponse>(`/files/${encodeURIComponent(file.id)}/content`, {
      method: 'PUT', headers: { 'if-match': String(file.revision) }, body: JSON.stringify({ document: stored }),
    })
  }
  async putAsset(fileId: string, assetId: string, blob: Blob) {
    const response = await fetch(`${this.baseUrl}/files/${encodeURIComponent(fileId)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'PUT', credentials: 'include', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob,
    })
    if (!response.ok) throw new ApiRequestError('Asset upload failed.', response.status)
  }
  async getAsset(fileId: string, assetId: string) {
    const response = await fetch(`${this.baseUrl}/files/${encodeURIComponent(fileId)}/assets/${encodeURIComponent(assetId)}`, { credentials: 'include' })
    if (!response.ok) throw new ApiRequestError('Asset download failed.', response.status)
    return response.blob()
  }
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

function mapImages(document: CanvasDocument, update: (image: Extract<CanvasElement, { type: 'image' }>) => Promise<Extract<CanvasElement, { type: 'image' }>>) {
  const mapLayers = async (layers: CanvasDocument['layers']) => Promise.all(layers.map(async (layer) => ({ ...layer,
    elements: await Promise.all(layer.elements.map((element) => element.type === 'image' ? update(element) : element)),
  })))
  return Promise.all([mapLayers(document.layers), Promise.all((document.pages ?? []).map(async (page) => ({ ...page, layers: await mapLayers(page.layers) })))])
    .then(([layers, pages]) => ({ ...document, layers, pages: document.pages ? pages : undefined }))
}

async function storeCloudAssets(document: CanvasDocument, fileId: string, client: ApiClient) {
  const uploaded = new Set<string>()
  return mapImages(document, async (image) => {
    const assetId = image.assetId ?? image.id
    if (!image.src.startsWith(CLOUD_ASSET_PREFIX) && !uploaded.has(assetId)) {
      const blob = await fetch(image.src).then((response) => response.blob())
      await client.putAsset(fileId, assetId, blob)
      uploaded.add(assetId)
    }
    return { ...image, assetId, src: `${CLOUD_ASSET_PREFIX}${assetId}` }
  })
}

async function hydrateCloudAssets(document: CanvasDocument, fileId: string, client: ApiClient) {
  const urls = new Map<string, Promise<string>>()
  return mapImages(document, async (image) => {
    if (!image.src.startsWith(CLOUD_ASSET_PREFIX)) return image
    const assetId = image.src.slice(CLOUD_ASSET_PREFIX.length)
    if (!urls.has(assetId)) urls.set(assetId, client.getAsset(fileId, assetId).then(URL.createObjectURL))
    return { ...image, assetId, src: await urls.get(assetId)! }
  })
}
