import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Company, CompanyFull, CompanyListItem, CompanyStatus, Draft, EventRow, Note, Person, Task } from './types'

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

const LIST_SELECT = '*, people(id, full_name, role, phone), tasks(id, done, due_at)'

// ───────────── Companii ─────────────
export function useCompanies(filters: { q: string; status: CompanyStatus | ''; eventId: string }) {
  return useQuery({
    queryKey: ['companies', filters],
    queryFn: async () => {
      const sel = filters.eventId ? `${LIST_SELECT}, encounters!inner(event_id)` : LIST_SELECT
      let q = filters.q.trim()
        ? supabase.rpc('search_companies', { q: filters.q, max_results: 200 }).select(sel)
        : supabase.from('companies').select(sel).order('updated_at', { ascending: false }).limit(500)
      if (filters.status) q = q.eq('status', filters.status)
      else q = q.neq('status', 'arhivat')
      if (filters.eventId) q = q.eq('encounters.event_id', filters.eventId)
      return must(await q) as unknown as CompanyListItem[]
    },
  })
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['company', id],
    enabled: !!id,
    queryFn: async () => {
      const c = must(
        await supabase
          .from('companies')
          .select('*, people(*), notes(*), tasks(*), events(id, name), encounters(*, events(id, name))')
          .eq('id', id!)
          .single(),
      ) as CompanyFull
      c.notes.sort((a, b) => b.created_at.localeCompare(a.created_at))
      c.tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))
      c.people.sort((a, b) => a.full_name.localeCompare(b.full_name))
      c.encounters.sort((a, b) => b.met_on.localeCompare(a.met_on))
      return c
    },
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (companyId?: string) => {
    qc.invalidateQueries({ queryKey: ['companies'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    if (companyId) qc.invalidateQueries({ queryKey: ['company', companyId] })
  }
}

export interface CompanyMatch {
  id: string
  name: string
  city: string | null
  reason: 'cod fiscal' | 'telefon' | 'email' | 'nume'
  score: number
}

/** Există deja firma? Potrivire după cod fiscal, telefon, email (sigure) sau nume (posibilă). */
export async function matchCompanies(d: Draft): Promise<CompanyMatch[]> {
  const phones = [d.company.phone, ...d.people.map((p) => p.phone)].filter(Boolean) as string[]
  const emails = [d.company.email, ...d.people.map((p) => p.email)].filter(Boolean) as string[]
  if (d.company.name.trim().length < 3 && !phones.length && !emails.length && !d.registry_id) return []
  return must(
    await supabase.rpc('match_companies', {
      p_name: d.company.name.trim().length >= 3 ? d.company.name : '',
      p_phones: phones,
      p_emails: emails,
      p_registry: d.registry_id ?? null,
    }),
  ) as CompanyMatch[]
}

/** Înregistrează unde am întâlnit firma (ignoră dublura pentru același eveniment). */
export async function addEncounter(companyId: string, e: { eventId: string | null; place?: string | null }) {
  if (!e.eventId && !e.place?.trim()) return
  const { error } = await supabase
    .from('encounters')
    .insert({ company_id: companyId, event_id: e.eventId, place: e.place?.trim() || null })
  if (error && error.code !== '23505') throw new Error(error.message)
}

const nn = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

/** Salvează o fișă extrasă de AI (sau completată manual). Dacă `intoCompanyId` e dat, adaugă la firma existentă. */
export async function saveDraft(
  draft: Draft,
  opts: { eventId: string | null; source: Note['source']; rawText?: string; intoCompanyId?: string; place?: string | null },
): Promise<string> {
  let companyId = opts.intoCompanyId
  const c = draft.company
  if (!companyId) {
    const row = must(
      await supabase
        .from('companies')
        .insert({
          name: c.name.trim() || 'Firmă fără nume',
          website: nn(c.website),
          category: nn(c.category),
          products: c.products.filter(Boolean),
          city: nn(c.city),
          country: nn(c.country),
          address: nn(c.address),
          phone: nn(c.phone),
          email: nn(c.email),
          status: draft.status,
          tags: draft.tags.filter(Boolean),
          event_id: opts.eventId,
          registry_id: draft.registry_id?.replace(/\D/g, '') || null,
          socials: socialsFromDraft(draft),
        })
        .select('id')
        .single(),
    ) as { id: string }
    companyId = row.id
  }

  const people = draft.people.filter((p) => p.full_name.trim())
  if (people.length)
    must(
      await supabase.from('people').insert(
        people.map((p) => ({ company_id: companyId, full_name: p.full_name.trim(), role: nn(p.role), phone: nn(p.phone), email: nn(p.email) })),
      ),
    )
  if (draft.note.trim()) must(await supabase.from('notes').insert({ company_id: companyId, body: draft.note.trim(), source: opts.source }))
  const tasks = draft.tasks.filter((t) => t.title.trim())
  if (tasks.length)
    must(await supabase.from('tasks').insert(tasks.map((t) => ({ company_id: companyId, title: t.title.trim(), due_at: t.due_at || null }))))
  await addEncounter(companyId!, { eventId: opts.eventId, place: opts.place })
  if (opts.intoCompanyId) {
    // firmă existentă: completăm rețelele / codul fiscal lipsă, fără să suprascriem
    const { data: cur } = await supabase.from('companies').select('socials, registry_id').eq('id', companyId!).single()
    const patch: Record<string, unknown> = { socials: { ...socialsFromDraft(draft), ...(cur?.socials ?? {}) } }
    if (!cur?.registry_id && draft.registry_id) patch.registry_id = draft.registry_id.replace(/\D/g, '')
    await supabase.from('companies').update(patch).eq('id', companyId!)
  }
  return companyId!
}

const SOCIAL_BASE: Record<string, string> = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  tiktok: 'https://www.tiktok.com/@',
}
export function socialUrl(kind: string, v: string) {
  const t = v.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/\.(com|ro|md)\//i.test(t)) return `https://${t}`
  return (SOCIAL_BASE[kind] ?? 'https://') + t.replace(/^@/, '')
}
function socialsFromDraft(d: Draft) {
  return Object.fromEntries(
    Object.entries(d.socials ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => [k, socialUrl(k, v as string)]),
  )
}

// ───────────── Cărți de vizită (bucket privat) ─────────────
export async function uploadCardImages(companyId: string, dataUrls: string[]) {
  const paths: string[] = []
  for (const url of dataUrls) {
    const blob = await (await fetch(url)).blob()
    const path = `${companyId}/${Date.now()}-${paths.length}.jpg`
    const { error } = await supabase.storage.from('carti').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    paths.push(path)
  }
  if (!paths.length) return
  const { data } = await supabase.from('companies').select('card_images').eq('id', companyId).single()
  must(await supabase.from('companies').update({ card_images: [...(data?.card_images ?? []), ...paths] }).eq('id', companyId))
}

export async function cardImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from('carti').createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl as string]))
}

// ───────────── Poze & video ale firmei (același bucket privat) ─────────────
export async function uploadCompanyMedia(companyId: string, files: { blob: Blob; ext: string; type: string }[]) {
  const paths: string[] = []
  for (const f of files) {
    const path = `${companyId}/media/${Date.now()}-${paths.length}.${f.ext}`
    const { error } = await supabase.storage.from('carti').upload(path, f.blob, { contentType: f.type })
    if (error) throw new Error(error.message)
    paths.push(path)
  }
  if (!paths.length) return
  const { data } = await supabase.from('companies').select('media').eq('id', companyId).single()
  must(await supabase.from('companies').update({ media: [...(data?.media ?? []), ...paths] }).eq('id', companyId))
}

export async function deleteCompanyMedia(companyId: string, path: string) {
  const { data } = await supabase.from('companies').select('media').eq('id', companyId).single()
  must(await supabase.from('companies').update({ media: (data?.media ?? []).filter((p: string) => p !== path) }).eq('id', companyId))
  await supabase.storage.from('carti').remove([path])
}

export const isVideo = (path: string) => /\.(mp4|mov|webm|m4v|3gp)$/i.test(path)

export async function companyHasLogo(companyId: string) {
  const { data } = await supabase.from('companies').select('logo_url').eq('id', companyId).single()
  return !!data?.logo_url
}

export function useUpdateCompany(id: string) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (patch: Partial<Company>) => must(await supabase.from('companies').update(patch).eq('id', id)),
    onSuccess: () => inv(id),
  })
}

export async function deleteCompany(id: string) {
  must(await supabase.from('companies').delete().eq('id', id))
}

// ───────────── Persoane / notițe / sarcini ─────────────
export function useRowMutations(companyId: string) {
  const inv = useInvalidate()
  const done = { onSuccess: () => inv(companyId) }
  return {
    upsertPerson: useMutation({
      mutationFn: async (p: Partial<Person>) =>
        must(await supabase.from('people').upsert({ ...p, company_id: companyId })),
      ...done,
    }),
    deletePerson: useMutation({
      mutationFn: async (id: string) => must(await supabase.from('people').delete().eq('id', id)),
      ...done,
    }),
    addNote: useMutation({
      mutationFn: async (n: { body: string; source?: Note['source'] }) =>
        must(await supabase.from('notes').insert({ company_id: companyId, body: n.body, source: n.source ?? 'text' })),
      ...done,
    }),
    toggleNote: useMutation({
      mutationFn: async (n: { id: string; collapsed: boolean }) =>
        must(await supabase.from('notes').update({ collapsed: n.collapsed }).eq('id', n.id)),
      ...done,
    }),
    addEncounter: useMutation({
      mutationFn: async (e: { eventId: string | null; place?: string | null }) => addEncounter(companyId, e),
      ...done,
    }),
    deleteEncounter: useMutation({
      mutationFn: async (id: string) => must(await supabase.from('encounters').delete().eq('id', id)),
      ...done,
    }),
    deleteNote: useMutation({
      mutationFn: async (id: string) => must(await supabase.from('notes').delete().eq('id', id)),
      ...done,
    }),
    upsertTask: useMutation({
      mutationFn: async (t: Partial<Task>) => must(await supabase.from('tasks').upsert({ ...t, company_id: companyId })),
      ...done,
    }),
    deleteTask: useMutation({
      mutationFn: async (id: string) => must(await supabase.from('tasks').delete().eq('id', id)),
      ...done,
    }),
  }
}

export function useOpenTasks() {
  return useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: async () =>
      must(
        await supabase
          .from('tasks')
          .select('id, title, due_at, done, company_id, companies(id, name)')
          .eq('done', false)
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(100),
      ) as unknown as (Task & { companies: { id: string; name: string } | null })[],
  })
}

// ───────────── Evenimente ─────────────
export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () =>
      must(
        await supabase.from('events').select('*, encounters(count)').order('starts_on', { ascending: false, nullsFirst: true }),
      ) as (EventRow & { encounters: { count: number }[] })[],
  })
}

export function useEventMutations() {
  const qc = useQueryClient()
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['events'] })
  return {
    upsert: useMutation({
      mutationFn: async (e: Partial<EventRow>) => must(await supabase.from('events').upsert(e).select().single()) as EventRow,
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => must(await supabase.from('events').delete().eq('id', id)),
      onSuccess,
    }),
  }
}

// ───────────── Echipă ─────────────
export interface TeamMember {
  email: string
  name: string | null
  role: 'admin' | 'membru'
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => must(await supabase.from('team_members').select('email, name, role').order('email')) as TeamMember[],
  })
}

export function useTeamMutations() {
  const qc = useQueryClient()
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['team'] })
  return {
    add: useMutation({
      mutationFn: async (m: TeamMember) =>
        must(await supabase.from('team_members').upsert({ ...m, email: m.email.trim().toLowerCase() })),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (email: string) => must(await supabase.from('team_members').delete().eq('email', email)),
      onSuccess,
    }),
  }
}

/** Urcă un logo ales de utilizator (poză / screenshot) și îl setează pe firmă. */
export async function uploadLogo(companyId: string, png: Blob) {
  const path = `${companyId}.png`
  const { error } = await supabase.storage.from('logos').upload(path, png, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(error.message)
  const url = `${supabase.storage.from('logos').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  must(await supabase.from('companies').update({ logo_url: url }).eq('id', companyId))
  return url
}
