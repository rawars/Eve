/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface Window {
  turnstile?: {
    render(container: HTMLElement, options: { sitekey: string; callback(token: string): void; 'expired-callback'(): void }): string
    remove(widgetId: string): void
  }
}
