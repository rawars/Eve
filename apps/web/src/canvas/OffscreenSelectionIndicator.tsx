import { offscreenIndicators } from './offscreenIndicator'
import type { Rectangle } from './types'

export function OffscreenSelectionIndicator({ bounds, viewport, onLocate }: {
  bounds: Rectangle
  viewport: { width: number; height: number }
  onLocate: () => void
}) {
  return <>{offscreenIndicators(bounds, viewport).map((indicator) => {
    const horizontal = indicator.edge === 'top' || indicator.edge === 'bottom'
    return <button key={indicator.edge} aria-label={`Locate selected element toward ${indicator.edge}`}
      title="Locate selected element" onClick={onLocate}
      className="absolute z-30 rounded-full bg-blue-500 shadow-[0_0_0_1px_rgba(255,255,255,0.7)] transition-colors hover:bg-blue-600"
      style={horizontal ? {
        left: indicator.offset, width: indicator.length, height: 2,
        top: indicator.edge === 'top' ? 0 : viewport.height - 2,
      } : {
        top: indicator.offset, height: indicator.length, width: 2,
        left: indicator.edge === 'left' ? 0 : viewport.width - 2,
      }} />
  })}</>
}
