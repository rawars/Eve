import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolbarPanel } from './ToolbarPanel'

describe('ToolbarPanel account menu', () => {
  afterEach(cleanup)

  it('shows the signed-in account at the right and logs out from its menu', async () => {
    const onLogout = vi.fn()
    const view = render(<ToolbarPanel activeTool="select" onToolChange={vi.fn()} onDownload={vi.fn()}
      onHistory={vi.fn()} onVariables={vi.fn()} onAssets={vi.fn()}
      account={{ label: 'rafael@example.com', onLogout }} />)

    fireEvent.click(view.getByRole('button', { name: 'Account menu' }))
    expect(await view.findByText('rafael@example.com')).toBeInTheDocument()
    fireEvent.click(view.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })
})
