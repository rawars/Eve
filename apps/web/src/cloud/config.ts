const isProductionHost = typeof window !== 'undefined' && window.location.hostname === 'eve-17s.pages.dev'

export const cloudApiUrl = import.meta.env.VITE_API_URL
  ?? (isProductionHost ? 'https://eve-api.rafaeljosegarciasuarez.workers.dev' : undefined)

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  ?? (isProductionHost ? '0x4AAAAAAExqA_GpJaHE1BfY' : undefined)
