import type { User } from '@eve/contracts'
import { useState } from 'react'
import type { ApiClient } from './api'
import { turnstileSiteKey } from './config'
import { AuthShell, TurnstileWidget } from './AuthShared'

export function LoginPage({ client, onAuthenticated, onRegister }: {
  client: ApiClient
  onAuthenticated: (user: User) => void | Promise<void>
  onRegister: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  return <AuthShell><form className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm" onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setError('')
    void client.login(email, password, turnstileToken).then(({ user }) => onAuthenticated(user))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Authentication failed.')).finally(() => setBusy(false))
  }}>
    <h1 className="text-2xl font-semibold">Eve</h1>
    <p className="mb-6 mt-1 text-sm text-neutral-500">Continue designing</p>
    <label className="mb-4 block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500" /></label>
    <label className="mb-2 block text-sm font-medium">Password<input required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500" /></label>
    {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />}
    {error && <p role="alert" className="my-3 text-sm text-red-600">{error}</p>}
    <button disabled={busy} className="mt-4 w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Sign in'}</button>
    <button type="button" onClick={onRegister} className="mt-4 w-full text-sm text-neutral-600 hover:text-neutral-950">New to Eve? Create an account</button>
  </form></AuthShell>
}
