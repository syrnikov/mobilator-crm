const API = 'https://api.openai.com/v1'

export const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini'
export const TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-4o-transcribe'

function key() {
  const k = Deno.env.get('OPENAI_API_KEY')
  if (!k) throw new Error('OPENAI_API_KEY nu este setat (supabase secrets set OPENAI_API_KEY=...)')
  return k
}

// deno-lint-ignore no-explicit-any
export type Json = any

export async function responses(body: Record<string, unknown>): Promise<Json> {
  const res = await fetch(`${API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, store: false, ...body }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`OpenAI: ${data?.error?.message ?? res.statusText}`)
  return data
}

/** Textul final dintr-un răspuns Responses API. */
export function outputText(resp: Json): string {
  if (typeof resp.output_text === 'string') return resp.output_text
  const parts: string[] = []
  for (const item of resp.output ?? []) {
    if (item.type === 'message') {
      for (const c of item.content ?? []) if (c.type === 'output_text') parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

/** Răspuns cu JSON strict conform unei scheme. */
export async function structured<T>(opts: {
  name: string
  schema: Record<string, unknown>
  instructions: string
  input: Json
  tools?: Json[]
}): Promise<T> {
  const resp = await responses({
    instructions: opts.instructions,
    input: opts.input,
    tools: opts.tools,
    text: { format: { type: 'json_schema', name: opts.name, schema: opts.schema, strict: true } },
  })
  return JSON.parse(outputText(resp)) as T
}

export async function transcribe(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file, file.name || 'audio.webm')
  form.append('model', TRANSCRIBE_MODEL)
  form.append('language', 'ro')
  form.append(
    'prompt',
    'Notițe de la un târg de mobilă: firme, nume de persoane, telefoane, PAL, MDF, CNC, fronturi, feronerie, cantuire.',
  )
  const res = await fetch(`${API}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`OpenAI: ${data?.error?.message ?? res.statusText}`)
  return data.text as string
}
