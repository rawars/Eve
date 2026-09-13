const encoder = new TextEncoder()
// Cloudflare Workers Web Crypto currently accepts at most 100,000 PBKDF2
// iterations. Keep the encoded work factor in each hash so it remains
// possible to raise this safely if the runtime limit changes.
const PASSWORD_ITERATIONS = 100_000

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function sha256(value: string) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, material, 256)
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derived))}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationsValue, saltValue, hashValue] = encoded.split('$')
  if (algorithm !== 'pbkdf2-sha256' || !iterationsValue || !saltValue || !hashValue) return false
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltValue), iterations: Number(iterationsValue),
  }, material, 256))
  const expected = base64ToBytes(hashValue)
  if (derived.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < derived.length; index += 1) difference |= derived[index] ^ expected[index]
  return difference === 0
}

export function sessionToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`
}
