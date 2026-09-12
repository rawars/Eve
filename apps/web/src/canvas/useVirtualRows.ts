import { useEffect, useMemo, useRef, useState } from 'react'

export function useVirtualRows(count: number, rowHeight: number, overscan = 6) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600 })
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => setViewport({ scrollTop: element.scrollTop, height: element.clientHeight })
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    return () => { observer?.disconnect(); element.removeEventListener('scroll', update) }
  }, [])
  return useMemo(() => {
    const start = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscan)
    const end = Math.min(count, Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + overscan)
    return { containerRef, start, end, totalHeight: count * rowHeight, offset: start * rowHeight }
  }, [count, overscan, rowHeight, viewport])
}
