type ImageRequest = { id: number; file: File; maxSourceDimension: number; maxCanvasDimension: number }

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageRequest>) => void) | null
  postMessage: (message: unknown) => void
}

workerScope.onmessage = (event) => {
  void (async () => {
    const { id, file, maxSourceDimension, maxCanvasDimension } = event.data
    try {
      const bitmap = await createImageBitmap(file)
      const sourceScale = Math.min(1, maxSourceDimension / Math.max(bitmap.width, bitmap.height))
      const sourceWidth = Math.max(1, Math.round(bitmap.width * sourceScale))
      const sourceHeight = Math.max(1, Math.round(bitmap.height * sourceScale))
      let blob: Blob = file
      if (sourceScale < 1) {
        const canvas = new OffscreenCanvas(sourceWidth, sourceHeight)
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, sourceWidth, sourceHeight)
        blob = await canvas.convertToBlob({ type: file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality: 0.9 })
      }
      bitmap.close()
      const displayScale = Math.min(1, maxCanvasDimension / Math.max(sourceWidth, sourceHeight))
      workerScope.postMessage({ id, blob, sourceWidth, sourceHeight,
        width: Math.max(1, Math.round(sourceWidth * displayScale)),
        height: Math.max(1, Math.round(sourceHeight * displayScale)) })
    } catch (error) {
      workerScope.postMessage({ id, error: error instanceof Error ? error.message : 'Could not prepare image' })
    }
  })()
}

export {}
