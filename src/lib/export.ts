import { z } from 'zod'
import { supabase } from './supabase'

const EXPORT_VERSION = 1

const omit = (o: Record<string, unknown>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

export async function exportAll(filter?: { eventId?: string }) {
  let cq = supabase.from('companies').select('*, people(*), notes(*), tasks(*)').order('name')
  if (filter?.eventId) cq = cq.eq('event_id', filter.eventId)
  const [companies, events] = await Promise.all([cq, supabase.from('events').select('*').order('starts_on')])
  if (companies.error) throw new Error(companies.error.message)
  if (events.error) throw new Error(events.error.message)
  return {
    app: 'mobilator-crm' as const,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    events: events.data,
    companies: (companies.data as Record<string, unknown>[]).map((c) => omit(c, 'search')),
  }
}

export const exportFilename = (suffix = '') =>
  `mobilator-conexiuni${suffix ? '-' + suffix : ''}-${new Date().toISOString().slice(0, 10)}.json`

const row = z.object({ id: z.string().uuid() }).passthrough()
const schema = z.object({
  app: z.literal('mobilator-crm'),
  version: z.number(),
  events: z.array(row),
  companies: z.array(
    row.extend({
      name: z.string(),
      people: z.array(row).default([]),
      notes: z.array(row).default([]),
      tasks: z.array(row).default([]),
    }),
  ),
})

/** Importă un export JSON (upsert după id — reimportul nu dublează). */
export async function importAll(text: string) {
  const data = schema.parse(JSON.parse(text))
  const chk = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
  }
  const strip = (o: Record<string, unknown>) => omit(o, 'created_by', 'search')
  if (data.events.length) chk(await supabase.from('events').upsert(data.events.map(strip)))
  if (data.companies.length)
    chk(await supabase.from('companies').upsert(data.companies.map((c) => strip(omit(c, 'people', 'notes', 'tasks', 'events')))))
  const people = data.companies.flatMap((c) => c.people.map(strip))
  const notes = data.companies.flatMap((c) => c.notes.map(strip))
  const tasks = data.companies.flatMap((c) => c.tasks.map(strip))
  if (people.length) chk(await supabase.from('people').upsert(people))
  if (notes.length) chk(await supabase.from('notes').upsert(notes))
  if (tasks.length) chk(await supabase.from('tasks').upsert(tasks))
  return { companies: data.companies.length, events: data.events.length }
}
