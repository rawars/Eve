import { useEffect, useRef, type ReactNode } from 'react'

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="flex h-dvh w-dvw items-center justify-center bg-neutral-100 p-6">{children}</main>
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let widgetId: string | undefined
    const render = () => {
      if (!container.current || !window.turnstile) return
      widgetId = window.turnstile.render(container.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken('') })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-eve-turnstile]')
    if (existing) {
      if (window.turnstile) render(); else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true; script.defer = true; script.dataset.eveTurnstile = 'true'; script.addEventListener('load', render, { once: true })
      document.head.append(script)
    }
    return () => { if (widgetId && window.turnstile) window.turnstile.remove(widgetId) }
  }, [onToken, siteKey])
  return <div className="mt-4 min-h-16" ref={container} />
}
