import { authenticatedUser, login, logout, register } from './auth'
import { createFile, deleteFile, getAsset, listFiles, putAsset, readFile, renameFile, updateFile } from './files'
import { corsHeaders, error, json, mutationOriginAllowed, withCors } from './http'
import { createProject, deleteProject, listProjects, renameProject } from './projects'
import type { Env } from './types'

async function route(request: Request, env: Env, context: ExecutionContext) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  if (!mutationOriginAllowed(request, env)) return error('INVALID_ORIGIN', 'Request origin is not allowed.', 403)
  const url = new URL(request.url)
  if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' })
  if (url.pathname === '/auth/register' && request.method === 'POST') return register(request, env)
  if (url.pathname === '/auth/login' && request.method === 'POST') return login(request, env)
  if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env)

  const user = await authenticatedUser(request, env)
  if (!user) return error('UNAUTHORIZED', 'Authentication is required.', 401)
  if (url.pathname === '/auth/me' && request.method === 'GET') return json({ user })
  if (url.pathname === '/projects' && request.method === 'GET') return listProjects(env, user)
  if (url.pathname === '/projects' && request.method === 'POST') return createProject(request, env, user)
  const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/)
  if (projectMatch && request.method === 'PATCH') return renameProject(request, env, user, decodeURIComponent(projectMatch[1]))
  if (projectMatch && request.method === 'DELETE') return deleteProject(env, user, decodeURIComponent(projectMatch[1]), context)
  if (url.pathname === '/files' && request.method === 'GET') {
    const projectId = url.searchParams.get('projectId') ?? ''
    if (!projectId) return error('PROJECT_REQUIRED', 'A project is required.')
    return listFiles(env, user, projectId)
  }
  if (url.pathname === '/files' && request.method === 'POST') return createFile(request, env, user)

  const assetMatch = url.pathname.match(/^\/files\/([^/]+)\/assets\/([^/]+)$/)
  if (assetMatch) {
    const fileId = decodeURIComponent(assetMatch[1])
    const assetId = decodeURIComponent(assetMatch[2])
    if (request.method === 'GET') return getAsset(env, user, fileId, assetId)
    if (request.method === 'PUT') return putAsset(request, env, user, fileId, assetId)
    return error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405)
  }

  const match = url.pathname.match(/^\/files\/([^/]+)(?:\/(content))?$/)
  if (!match) return error('NOT_FOUND', 'Route not found.', 404)
  const fileId = decodeURIComponent(match[1])
  if (match[2] === 'content' && request.method === 'GET') return readFile(env, user, fileId)
  if (match[2] === 'content' && request.method === 'PUT') return updateFile(request, env, user, fileId)
  if (!match[2] && request.method === 'PATCH') return renameFile(request, env, user, fileId)
  if (!match[2] && request.method === 'DELETE') return deleteFile(env, user, fileId, context)
  return error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405)
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext) {
    try { return withCors(await route(request, env, context), request, env) }
    catch (cause) {
      console.error('Unhandled API error', cause)
      return withCors(error('INTERNAL_ERROR', 'An unexpected error occurred.', 500), request, env)
    }
  },
} satisfies ExportedHandler<Env>
