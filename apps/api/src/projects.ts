import type { Project, ProjectListResponse, ProjectResponse } from '@eve/contracts'
import { body, error, json } from './http'
import type { AuthenticatedUser, Env } from './types'

type ProjectRow = { id: string; name: string; created_at: string; updated_at: string }
const publicProject = (row: ProjectRow): Project => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at })

export async function listProjects(env: Env, user: AuthenticatedUser) {
  const result = await env.DB.prepare('SELECT id, name, created_at, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC')
    .bind(user.id).all<ProjectRow>()
  return json({ projects: result.results.map(publicProject) } satisfies ProjectListResponse)
}

export async function createProject(request: Request, env: Env, user: AuthenticatedUser) {
  const value = await body<{ name?: unknown }>(request)
  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 120) : 'Untitled project'
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, user.id, name, now, now).run()
  return json({ project: publicProject({ id, name, created_at: now, updated_at: now }) } satisfies ProjectResponse, 201)
}

export async function renameProject(request: Request, env: Env, user: AuthenticatedUser, projectId: string) {
  const value = await body<{ name?: unknown }>(request)
  const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 120) : ''
  if (!name) return error('INVALID_NAME', 'Project name is required.')
  const now = new Date().toISOString()
  const result = await env.DB.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(name, now, projectId, user.id).run()
  if (!result.meta.changes) return error('NOT_FOUND', 'Project not found.', 404)
  const row = await env.DB.prepare('SELECT id, name, created_at, updated_at FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>()
  return json({ project: publicProject(row!) } satisfies ProjectResponse)
}

export async function deleteProject(env: Env, user: AuthenticatedUser, projectId: string, context: ExecutionContext) {
  const files = await env.DB.prepare('SELECT id FROM files WHERE project_id = ? AND owner_id = ?').bind(projectId, user.id).all<{ id: string }>()
  const result = await env.DB.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?').bind(projectId, user.id).run()
  if (!result.meta.changes) return error('NOT_FOUND', 'Project not found.', 404)
  context.waitUntil(Promise.all(files.results.flatMap((file) => [
    deletePrefix(env.DOCUMENTS, `documents/${user.id}/${file.id}/`),
    deletePrefix(env.DOCUMENTS, `assets/${user.id}/${file.id}/`),
  ])).then(() => undefined))
  return new Response(null, { status: 204 })
}

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    if (page.objects.length) await bucket.delete(page.objects.map(({ key }) => key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}
