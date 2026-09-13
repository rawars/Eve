export type Env = {
  DB: D1Database
  DOCUMENTS: R2Bucket
  APP_ORIGIN: string
  SESSION_TTL_DAYS?: string
  TURNSTILE_ENABLED?: string
  TURNSTILE_SECRET_KEY?: string
  AI: Ai
}

export type AuthenticatedUser = { id: string; email: string; createdAt: string }
