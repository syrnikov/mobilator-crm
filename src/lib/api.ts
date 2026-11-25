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
      let q = filters.q.trim()
        ? supabase.rpc('search_companies', { q: filters.q, max_results: 200 }).select(LIST_SELECT)
        : supabase.from('companies').select(LIST_SELECT).order('updated_at', { ascending: false }).limit(500)
      if (filters.status) q = q.eq('status', filters.status)
      else q = q.neq('status', 'arhivat')
      if (filters.eventId) q = q.eq('event_id', filters.eventId)
      return must(await q) as CompanyListItem[]
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
          .select('*, people(*), notes(*), tasks(*), events(id, name)')
          .eq('id', id!)
          .single(),
      ) as CompanyFull
      c.notes.sort((a, b) => b.created_at.localeCompare(a.created_at))
      c.tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))
      c.people.sort((a, b) => a.full_name.localeCompare(b.full_name))
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

export async function findSimilarCompanies(name: string) {
  if (name.trim().length < 3) return []
  return must(await supabase.rpc('search_companies', { q: name, max_results: 3 }).select('id, name, city')) as Pick<
    Company,
    'id' | 'name' | 'city'
  >[]
}

const nn = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

/** Salvează o fișă extrasă de AI (sau completată manual). Dacă `intoCompanyId` e dat, adaugă la firma existentă. */
export async function saveDraft(
  draft: Draft,
  opts: { eventId: string | null; source: Note['source']; rawText?: string; intoCompanyId?: string },
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
  return companyId!
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
        await supabase.from('events').select('*, companies(count)').order('starts_on', { ascending: false, nullsFirst: true }),
      ) as (EventRow & { companies: { count: number }[] })[],
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
