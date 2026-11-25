import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './auth.ts'

/** Admin: creează/actualizează contul unui coleg (email + parolă, confirmat direct, fără email). */
export async function setMember(
  supabase: SupabaseClient,
  body: { email?: string; password?: string; name?: string | null; role?: 'admin' | 'membru' },
) {
  const { data: isAdmin } = await supabase.rpc('is_team_admin')
  if (!isAdmin) throw new HttpError(403, 'Doar administratorii pot gestiona conturi')

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email.includes('@')) throw new HttpError(400, 'Email invalid')
  if (body.password && body.password.length < 6) throw new HttpError(400, 'Parola trebuie să aibă minim 6 caractere')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { error: tmErr } = await admin
    .from('team_members')
    .upsert({ email, name: body.name ?? null, role: body.role ?? 'membru' })
  if (tmErr) throw new HttpError(500, tmErr.message)

  if (body.password) {
    const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) throw new HttpError(500, error.message)
    const existing = list.users.find((u) => u.email?.toLowerCase() === email)
    const res = existing
      ? await admin.auth.admin.updateUserById(existing.id, { password: body.password, email_confirm: true })
      : await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true })
    if (res.error) throw new HttpError(500, res.error.message)
  }
  return { ok: true, email }
}
