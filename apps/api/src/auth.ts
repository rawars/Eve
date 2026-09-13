import type { AuthResponse } from '@eve/contracts'
import { body, error, json } from './http'
import { hashPassword, sessionToken, sha256, verifyPassword } from './security'
import type { AuthenticatedUser, Env } from './types'

const SESSION_COOKIE = 'eve_session'
type Credentials = { email?: unknown; password?: unknown; turnstileToken?: unknown }

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

function sessionCookie(token: string, maxAge: number, secure: boolean) {
  const sitePolicy = secure ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax'
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Max-Age=${maxAge}${sitePolicy}`
}

function normalizeCredentials(value: Credentials | null) {
  const email = typeof value?.email === 'string' ? value.email.trim().toLowerCase() : ''
  const password = typeof value?.password === 'string' ? value.password : ''
  const turnstileToken = typeof value?.turnstileToken === 'string' ? value.turnstileToken : ''
  return { email, password, turnstileToken }
}

async function verifyTurnstile(request: Request, env: Env, token: string) {
  if (env.TURNSTILE_ENABLED !== 'true') return true
  if (!env.TURNSTILE_SECRET_KEY || !token) return false
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET_KEY)
  form.set('response', token)
  form.set('remoteip', request.headers.get('CF-Connecting-IP') ?? '')
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const result = await response.json<{ success?: boolean }>()
  return result.success === true
}

async function createSession(env: Env, userId: string) {
  const token = sessionToken()
  const now = new Date()
  const days = Math.max(1, Number(env.SESSION_TTL_DAYS ?? 30))
  const expires = new Date(now.getTime() + days * 86_400_000)
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, await sha256(token), expires.toISOString(), now.toISOString()).run()
  return { token, maxAge: days * 86_400 }
}

export async function authenticatedUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = cookieValue(request, SESSION_COOKIE)
  if (!token) return null
  const row = await env.DB.prepare(`SELECT users.id, users.email, users.created_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).bind(await sha256(token), new Date().toISOString())
    .first<{ id: string; email: string; created_at: string }>()
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null
}

export async function register(request: Request, env: Env) {
  const credentials = normalizeCredentials(await body<Credentials>(request))
  if (!/^\S+@\S+\.\S+$/.test(credentials.email)) return error('INVALID_EMAIL', 'Enter a valid email address.')
  if (credentials.password.length < 10 || credentials.password.length > 128) return error('INVALID_PASSWORD', 'Password must contain between 10 and 128 characters.')
  if (!await verifyTurnstile(request, env, credentials.turnstileToken)) return error('TURNSTILE_FAILED', 'Human verification failed.', 403)
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(credentials.email).first()
  if (existing) return error('EMAIL_IN_USE', 'An account with this email already exists.', 409)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  try {
    const projectId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, credentials.email, await hashPassword(credentials.password), createdAt),
      env.DB.prepare('INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(projectId, id, 'My project', createdAt, createdAt),
    ])
  } catch (cause) {
    // A concurrent registration can still win after the initial lookup. Only
    // report a conflict when the account now exists; do not disguise unrelated
    // D1 failures as a duplicate email.
    const duplicate = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(credentials.email).first()
    if (duplicate) return error('EMAIL_IN_USE', 'An account with this email already exists.', 409)
    console.error('Failed to create account', cause)
    throw cause
  }
  const session = await createSession(env, id)
  return json({ user: { id, email: credentials.email, createdAt } } satisfies AuthResponse, 201, {
    'set-cookie': sessionCookie(session.token, session.maxAge, !env.APP_ORIGIN.startsWith('http://localhost')),
  })
}

export async function login(request: Request, env: Env) {
  const credentials = normalizeCredentials(await body<Credentials>(request))
  if (!await verifyTurnstile(request, env, credentials.turnstileToken)) return error('TURNSTILE_FAILED', 'Human verification failed.', 403)
  const row = await env.DB.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?').bind(credentials.email)
    .first<{ id: string; email: string; password_hash: string; created_at: string }>()
  if (!row || !await verifyPassword(credentials.password, row.password_hash)) return error('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
  const session = await createSession(env, row.id)
  return json({ user: { id: row.id, email: row.email, createdAt: row.created_at } } satisfies AuthResponse, 200, {
    'set-cookie': sessionCookie(session.token, session.maxAge, !env.APP_ORIGIN.startsWith('http://localhost')),
  })
}

export async function logout(request: Request, env: Env) {
  const token = cookieValue(request, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return new Response(null, { status: 204, headers: { 'set-cookie': sessionCookie('', 0, !env.APP_ORIGIN.startsWith('http://localhost')) } })
}
