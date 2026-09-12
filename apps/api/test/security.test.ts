import { describe, expect, it } from 'vitest'
import { hashPassword, sha256, verifyPassword } from '../src/security'

describe('password security', () => {
  it('hashes and verifies without storing the password', async () => {
    const encoded = await hashPassword('correct horse battery staple')
    expect(encoded).not.toContain('correct horse')
    expect(await verifyPassword('correct horse battery staple', encoded)).toBe(true)
    expect(await verifyPassword('wrong password', encoded)).toBe(false)
  })

  it('creates stable token digests', async () => {
    expect(await sha256('session-token')).toBe(await sha256('session-token'))
    expect(await sha256('session-token')).not.toBe(await sha256('other-token'))
  })
})
