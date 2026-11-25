// Creează sau resetează contul unui membru al echipei (email + parolă, fără email de confirmare).
// Utilizare:  node scripts/set-password.mjs <email> <parola> [Nume]
// Cheia service_role se ia din Supabase CLI (trebuie `npx supabase login`) și nu se afișează.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [email, password, name] = process.argv.slice(2)
if (!email || !password) {
  console.error('Utilizare: node scripts/set-password.mjs <email> <parola> [Nume]')
  process.exit(1)
}
if (password.length < 6) {
  console.error('Parola trebuie să aibă minim 6 caractere.')
  process.exit(1)
}

const url = readFileSync('.env', 'utf8').match(/VITE_SUPABASE_URL=(\S+)/)?.[1]
const ref = url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref) throw new Error('Nu găsesc VITE_SUPABASE_URL în .env')

const keys = JSON.parse(
  execSync(`npx supabase projects api-keys --remote=${ref} -o json`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
)
const serviceKey = keys.find((k) => k.id === 'service_role')?.api_key
if (!serviceKey) throw new Error('Nu am putut obține cheia service_role')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const e = email.trim().toLowerCase()

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) throw listErr
const existing = list.users.find((u) => u.email?.toLowerCase() === e)

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  if (error) throw error
  console.log(`Parolă actualizată pentru ${e}`)
} else {
  const { error } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true })
  if (error) throw error
  console.log(`Cont creat pentru ${e}`)
}

const { data: member } = await admin.from('team_members').select('email').eq('email', e).maybeSingle()
if (!member) {
  await admin.from('team_members').insert({ email: e, name: name ?? null, role: 'membru' })
  console.log('Adăugat în echipă ca membru.')
}
