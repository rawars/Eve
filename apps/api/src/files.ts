import type { DesignFile, FileContentResponse, FileListResponse, FileResponse } from '@eve/contracts'
import { body, error, json } from './http'
import type { AuthenticatedUser, Env } from './types'

type FileRow = { id: string; project_id: string; name: string; revision: number; content_size: number; created_at: string; updated_at: string; content_key?: string }
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
const MAX_ASSET_BYTES = 25 * 1024 * 1024
const encoder = new TextEncoder()

function publicFile(row: FileRow): DesignFile {
  return { id: row.id, projectId: row.project_id, name: row.name, revision: row.revision, contentSize: row.content_size, createdAt: row.created_at, updatedAt: row.updated_at }
}

function contentKey(userId: string, fileId: string, revision: number) {
  return `documents/${userId}/${fileId}/${revision}.json`
}

function serializeDocument(document: unknown) {
  if (!document || typeof document !== 'object') return null
  try {
    const value = JSON.stringify(document)
    return { value, size: encoder.encode(value).byteLength }
  } catch { return null }
}

async function ownedFile(env: Env, userId: string, fileId: string) {
  return env.DB.prepare(`SELECT id, project_id, name, revision, content_size, created_at, updated_at, content_key
    FROM files WHERE id = ? AND owner_id = ?`).bind(fileId, userId).first<FileRow>()
}

export async function listFiles(env: Env, user: AuthenticatedUser, projectId: string) {
  const result = await env.DB.prepare(`SELECT id, project_id, name, revision, content_size, created_at, updated_at
    FROM files WHERE owner_id = ? AND project_id = ? ORDER BY updated_at DESC`).bind(user.id, projectId).all<FileRow>()
  return json({ files: result.results.map(publicFile) } satisfies FileListResponse)
}

export async function createFile(request: Request, env: Env, user: AuthenticatedUser) {
  const value = await body<{ projectId?: unknown; name?: unknown; document?: unknown }>(request)
  const projectId = typeof value?.projectId === 'string' ? value.projectId : ''
  const project = projectId ? await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, user.id).first() : null
  if (!project) return error('PROJECT_NOT_FOUND', 'Project not found.', 404)
  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 120) : 'Untitled'
  const document = value?.document ?? { layers: [], activeElementId: null, selectedElementIds: [], background: '#E0E0E0' }
  const serialized = serializeDocument(document)
  if (!serialized) return error('INVALID_DOCUMENT', 'The document must be a JSON object.')
  if (serialized.size > MAX_DOCUMENT_BYTES) return error('DOCUMENT_TOO_LARGE', 'The document exceeds the 50 MB upload limit.', 413)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const key = contentKey(user.id, id, 1)
  await env.DOCUMENTS.put(key, serialized.value, { httpMetadata: { contentType: 'application/json' }, customMetadata: { fileId: id, revision: '1' } })
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO files (id, owner_id, project_id, name, content_key, revision, content_size, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`).bind(id, user.id, projectId, name, key, serialized.size, now, now),
      env.DB.prepare('UPDATE projects SET updated_at = ? WHERE id = ? AND owner_id = ?').bind(now, projectId, user.id),
    ])
  } catch (cause) {
    await env.DOCUMENTS.delete(key)
    throw cause
  }
  return json({ file: publicFile({ id, project_id: projectId, name, revision: 1, content_size: serialized.size, created_at: now, updated_at: now }) } satisfies FileResponse, 201)
}

export async function readFile(env: Env, user: AuthenticatedUser, fileId: string) {
  const file = await ownedFile(env, user.id, fileId)
  if (!file?.content_key) return error('NOT_FOUND', 'File not found.', 404)
  const object = await env.DOCUMENTS.get(file.content_key)
  if (!object) return error('CONTENT_NOT_FOUND', 'The file content is unavailable.', 503)
  const document = await object.json<unknown>()
  return json({ file: publicFile(file), document } satisfies FileContentResponse)
}

export async function updateFile(request: Request, env: Env, user: AuthenticatedUser, fileId: string) {
  const current = await ownedFile(env, user.id, fileId)
  if (!current?.content_key) return error('NOT_FOUND', 'File not found.', 404)
  const match = request.headers.get('if-match')?.replaceAll('"', '')
  const expectedRevision = Number(match)
  if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
    return error('REVISION_CONFLICT', 'The file changed on another device. Reload before saving.', 409)
  }
  const value = await body<{ document?: unknown }>(request)
  if (!value || !('document' in value)) return error('INVALID_DOCUMENT', 'A document is required.')
  const serialized = serializeDocument(value.document)
  if (!serialized) return error('INVALID_DOCUMENT', 'The document must be a JSON object.')
  if (serialized.size > MAX_DOCUMENT_BYTES) return error('DOCUMENT_TOO_LARGE', 'The document exceeds the 50 MB upload limit.', 413)
  const revision = current.revision + 1
  const key = contentKey(user.id, fileId, revision)
  const now = new Date().toISOString()
  await env.DOCUMENTS.put(key, serialized.value, { httpMetadata: { contentType: 'application/json' }, customMetadata: { fileId, revision: String(revision) } })
  const result = await env.DB.prepare(`UPDATE files SET content_key = ?, revision = ?, content_size = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? AND revision = ?`).bind(key, revision, serialized.size, now, fileId, user.id, expectedRevision).run()
  if (!result.meta.changes) {
    await env.DOCUMENTS.delete(key)
    return error('REVISION_CONFLICT', 'The file changed on another device. Reload before saving.', 409)
  }
  return json({ file: publicFile({ ...current, revision, content_size: serialized.size, updated_at: now }) } satisfies FileResponse)
}

export async function putAsset(request: Request, env: Env, user: AuthenticatedUser, fileId: string, assetId: string) {
  if (!await ownedFile(env, user.id, fileId)) return error('NOT_FOUND', 'File not found.', 404)
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_ASSET_BYTES) return error('ASSET_TOO_LARGE', 'The asset exceeds the 25 MB upload limit.', 413)
  const data = await request.arrayBuffer()
  if (data.byteLength > MAX_ASSET_BYTES) return error('ASSET_TOO_LARGE', 'The asset exceeds the 25 MB upload limit.', 413)
  const contentType = request.headers.get('content-type') || 'application/octet-stream'
  const key = `assets/${user.id}/${fileId}/${assetId}`
  await env.DOCUMENTS.put(key, data, { httpMetadata: { contentType }, customMetadata: { fileId, assetId } })
  await env.DB.prepare(`INSERT INTO file_assets (file_id, asset_id, object_key, content_type, content_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(file_id, asset_id) DO UPDATE SET
    object_key = excluded.object_key, content_type = excluded.content_type, content_size = excluded.content_size`)
    .bind(fileId, assetId, key, contentType, data.byteLength, new Date().toISOString()).run()
  return new Response(null, { status: 204 })
}

export async function getAsset(env: Env, user: AuthenticatedUser, fileId: string, assetId: string) {
  const row = await env.DB.prepare(`SELECT file_assets.object_key, file_assets.content_type
    FROM file_assets JOIN files ON files.id = file_assets.file_id
    WHERE file_assets.file_id = ? AND file_assets.asset_id = ? AND files.owner_id = ?`)
    .bind(fileId, assetId, user.id).first<{ object_key: string; content_type: string }>()
  if (!row) return error('NOT_FOUND', 'Asset not found.', 404)
  const object = await env.DOCUMENTS.get(row.object_key)
  if (!object) return error('NOT_FOUND', 'Asset not found.', 404)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('content-type', row.content_type)
  headers.set('cache-control', 'private, max-age=3600')
  if (object.httpEtag) headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
}

export async function renameFile(request: Request, env: Env, user: AuthenticatedUser, fileId: string) {
  const value = await body<{ name?: unknown }>(request)
  const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 120) : ''
  if (!name) return error('INVALID_NAME', 'File name is required.')
  const now = new Date().toISOString()
  const result = await env.DB.prepare('UPDATE files SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(name, now, fileId, user.id).run()
  if (!result.meta.changes) return error('NOT_FOUND', 'File not found.', 404)
  const file = await ownedFile(env, user.id, fileId)
  return json({ file: publicFile(file!) } satisfies FileResponse)
}

export async function deleteFile(env: Env, user: AuthenticatedUser, fileId: string, context: ExecutionContext) {
  const result = await env.DB.prepare('DELETE FROM files WHERE id = ? AND owner_id = ?').bind(fileId, user.id).run()
  if (!result.meta.changes) return error('NOT_FOUND', 'File not found.', 404)
  context.waitUntil(Promise.all([
    deleteObjectsWithPrefix(env.DOCUMENTS, `documents/${user.id}/${fileId}/`),
    deleteObjectsWithPrefix(env.DOCUMENTS, `assets/${user.id}/${fileId}/`),
  ]).then(() => undefined))
  return new Response(null, { status: 204 })
}

async function deleteObjectsWithPrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    if (page.objects.length) await bucket.delete(page.objects.map((object) => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}
