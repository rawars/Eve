const DATABASE_NAME = 'eve.canvas'
const DATABASE_VERSION = 2
export const HISTORY_STORE = 'history'
export const DOCUMENT_STORE = 'documents'
export const ASSET_STORE = 'assets'

let databasePromise: Promise<IDBDatabase | null> | undefined

export function canvasDatabase() {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      for (const store of [HISTORY_STORE, DOCUMENT_STORE, ASSET_STORE]) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store)
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => { databasePromise = undefined; resolve(null) }
    request.onblocked = () => { databasePromise = undefined; resolve(null) }
  })
  return databasePromise
}
