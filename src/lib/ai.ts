import { FUNCTIONS_URL, supabase } from './supabase'
import type { Draft } from './types'

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Nu ești autentificat')
  return { Authorization: `Bearer ${data.session.access_token}` }
}

async function call<T>(body: BodyInit, json: boolean): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/ai`, {
    method: 'POST',
    headers: { ...(await authHeader()), ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Eroare AI (${res.status})`)
  return data as T
}

const post = <T>(payload: Record<string, unknown>) => call<T>(JSON.stringify(payload), true)

export async function transcribeAudio(blob: Blob): Promise<string> {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const form = new FormData()
  form.append('file', blob, `notita.${ext}`)
  const r = await call<{ text: string }>(form, false)
  return r.text
}

export const extractDraft = (input: { text?: string; images?: string[] }) => post<Draft>({ action: 'extract', ...input })

export type ChatMessage = { role: 'user' | 'assistant'; content: string; actions?: ChatAction[] }
export type CalendarProposal = { title: string; start: string; end?: string; location?: string; description?: string; company_id?: string }
export type ChatAction = { type: 'calendar'; event: CalendarProposal } | { type: 'company'; id: string; name: string }

export const chat = (messages: ChatMessage[], event: { id: string; name: string } | null) =>
  post<{ reply: string; actions: ChatAction[]; changed: boolean }>({
    action: 'chat',
    messages: messages.map(({ role, content }) => ({ role, content })),
    event_id: event?.id ?? null,
    event_name: event?.name ?? null,
  })

export const researchCompany = (companyId: string) =>
  post<{ found: boolean; summary: string | null; updated: string[] }>({ action: 'research', company_id: companyId })

export const draftEmail = (companyId: string, intent?: string) =>
  post<{ subject: string; body: string }>({ action: 'draft_email', company_id: companyId, intent })

export const setMember = (m: { email: string; password?: string; name?: string | null; role?: 'admin' | 'membru' }) =>
  post<{ ok: true; email: string }>({ action: 'set_member', ...m })
