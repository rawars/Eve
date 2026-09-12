const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
const isTest = import.meta.env.MODE === 'test'

export const cloudApiUrl = import.meta.env.VITE_API_URL
  ?? (isTest ? undefined : isLocalHost ? 'http://localhost:8787' : 'https://eve-api.rafaeljosegarciasuarez.workers.dev')

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  ?? (isLocalHost ? '1x00000000000000000000AA' : '0x4AAAAAAExqA_GpJaHE1BfY')
