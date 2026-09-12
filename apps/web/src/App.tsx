import { CanvasEditor } from './canvas/CanvasEditor'
import { CloudApp } from './cloud/CloudApp'
import { cloudApiUrl } from './cloud/config'

export function App() {
  if (cloudApiUrl) return <CloudApp apiUrl={cloudApiUrl} />
  return (
    <main className="h-dvh w-dvw overflow-hidden bg-neutral-100">
      <CanvasEditor />
    </main>
  )
}
