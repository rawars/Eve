import type { ApiError } from '@eve/contracts'
import type { Env } from './types'

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export function error(code: string, message: string, status = 400) {
  return json({ error: { code, message } } satisfies ApiError, status)
}

export async function body<T>(request: Request): Promise<T | null> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return null
  try { return await request.json<T>() } catch { return null }
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin')
  return origin === env.APP_ORIGIN ? {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, if-match',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'vary': 'Origin',
  } : {}
}

export function mutationOriginAllowed(request: Request, env: Env) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true
  return request.headers.get('origin') === env.APP_ORIGIN
}

export function withCors(response: Response, request: Request, env: Env) {
  const next = new Response(response.body, response)
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => next.headers.set(key, value))
  return next
}
