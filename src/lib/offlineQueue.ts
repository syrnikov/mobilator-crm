// Coadă offline: capturile făcute fără internet se procesează automat la reconectare.
import { get, set } from 'idb-keyval'
import { useEffect, useSyncExternalStore } from 'react'
import { extractDraft, transcribeAudio } from './ai'
import { saveDraft } from './api'
import { emptyDraft, type Draft } from './types'

export interface QueuedCapture {
  id: string
  createdAt: string
  eventId: string | null
  text?: string
  audio?: Blob
  images?: string[]
}

const KEY = 'mobilator.queue'
let count = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

async function read(): Promise<QueuedCapture[]> {
  return (await get<QueuedCapture[]>(KEY)) ?? []
}
async function write(items: QueuedCapture[]) {
  await set(KEY, items)
  count = items.length
  emit()
}

export async function enqueue(c: Omit<QueuedCapture, 'id' | 'createdAt'>) {
  const items = await read()
  items.push({ ...c, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
  await write(items)
}

let flushing = false
export async function flushQueue(onSaved?: () => void) {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const item of await read()) {
      let text = item.text ?? ''
      if (item.audio) text = [text, await transcribeAudio(item.audio)].filter(Boolean).join('\n')
      let draft: Draft
      try {
        draft = await extractDraft({ text: text || undefined, images: item.images })
      } catch {
        draft = { ...emptyDraft(), note: text }
        draft.company.name = 'De verificat — captură offline'
      }
      draft.tags = [...new Set([...draft.tags, 'offline'])]
      await saveDraft(draft, {
        eventId: item.eventId,
        source: item.audio ? 'voce' : item.images?.length ? 'scanare' : 'text',
      })
      await write((await read()).filter((i) => i.id !== item.id))
      onSaved?.()
    }
  } finally {
    flushing = false
  }
}

read().then((i) => {
  count = i.length
  emit()
})

export function useQueueCount() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => count,
  )
}

/** Montat o dată în App: golește coada la pornire și la reconectare. */
export function useQueueFlusher(onSaved: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const run = () => flushQueue(onSaved).catch(console.error)
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [onSaved, enabled])
}
