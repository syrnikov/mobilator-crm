import { useSyncExternalStore } from 'react'

const KEY = 'mobilator.currentEvent'
const listeners = new Set<() => void>()

export type CurrentEvent = { id: string; name: string } | null

let cached: string | null = localStorage.getItem(KEY)

export function getCurrentEvent(): CurrentEvent {
  try {
    return cached ? (JSON.parse(cached) as CurrentEvent) : null
  } catch {
    return null
  }
}

export function setCurrentEvent(ev: CurrentEvent) {
  cached = ev ? JSON.stringify(ev) : null
  if (cached) localStorage.setItem(KEY, cached)
  else localStorage.removeItem(KEY)
  listeners.forEach((l) => l())
}

export function useCurrentEvent(): CurrentEvent {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => cached,
  )
  return raw ? (JSON.parse(raw) as CurrentEvent) : null
}
