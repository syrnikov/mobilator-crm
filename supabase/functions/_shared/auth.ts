import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Client Supabase care rulează cu JWT-ul utilizatorului — RLS rămâne activ. */
export async function userClient(req: Request): Promise<SupabaseClient> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Lipsește autentificarea')

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (userErr || !userData.user) throw new HttpError(401, 'Sesiune invalidă')

  const { data: isMember, error } = await supabase.rpc('is_team_member')
  if (error) throw new HttpError(500, error.message)
  if (!isMember) throw new HttpError(403, 'Contul nu face parte din echipa Mobilator')

  return supabase
}
