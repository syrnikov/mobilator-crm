// Edge Function `ai` — tot ce ține de OpenAI pentru Mobilator CRM.
// Acțiuni: transcribe | extract | chat | research | draft_email | set_member
import { corsHeaders, json } from '../_shared/cors.ts'
import { HttpError, userClient } from '../_shared/auth.ts'
import { outputText, responses, structured, transcribe, type Json } from '../_shared/openai.ts'
import { toolDefs, runTool, type Action } from '../_shared/tools.ts'
import { researchCompany } from '../_shared/research.ts'
import { setMember } from '../_shared/members.ts'

const TZ = 'Europe/Bucharest'

function nowRo() {
  const d = new Date()
  const local = d.toLocaleString('ro-RO', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${local} (ora României, ${TZ}; ISO UTC ${d.toISOString()})`
}

const BRAND =
  'Mobilator este un producător român de mobilier la comandă (atelier cu CNC, PAL, MDF, fronturi, cantuire). ' +
  'Echipa de management merge la târguri și întâlniri de producători de mobilă ca să cunoască firme noi: ' +
  'furnizori, producători, designeri, distribuitori, potențiali colaboratori.'

// ───────────── extract ─────────────
const nullable = (t: string) => ({ type: [t, 'null'] })
const extractSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['company', 'people', 'note', 'tasks', 'tags', 'status'],
  properties: {
    company: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'website', 'category', 'products', 'city', 'country', 'address', 'phone', 'email'],
      properties: {
        name: { type: 'string', description: 'numele firmei, curățat (fără SRL dacă nu e esențial)' },
        website: nullable('string'),
        category: { ...nullable('string'), description: 'ex: producător mobilier, furnizor PAL/MDF, feronerie, CNC, tapițerie' },
        products: { type: 'array', items: { type: 'string' } },
        city: nullable('string'),
        country: nullable('string'),
        address: nullable('string'),
        phone: { ...nullable('string'), description: 'format internațional +40...' },
        email: nullable('string'),
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['full_name', 'role', 'phone', 'email'],
        properties: {
          full_name: { type: 'string' },
          role: nullable('string'),
          phone: { ...nullable('string'), description: 'format internațional +40...' },
          email: nullable('string'),
        },
      },
    },
    note: { type: 'string', description: 'notiță curată, în română, cu ce s-a discutat — bullet points scurte cu „•”' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'due_at'],
        properties: {
          title: { type: 'string', description: 'acțiune concretă, ex: „Sună-l pe Ion pentru ofertă fronturi”' },
          due_at: { ...nullable('string'), description: 'ISO 8601 cu offset România, dacă s-a menționat un termen' },
        },
      },
    },
    tags: { type: 'array', items: { type: 'string' }, description: '2-5 etichete scurte, lowercase' },
    status: { type: 'string', enum: ['nou', 'de_contactat', 'in_discutii', 'colaborator'] },
  },
}

async function extract(body: Json) {
  const content: Json[] = []
  if (body.text) content.push({ type: 'input_text', text: String(body.text) })
  for (const img of body.images ?? []) content.push({ type: 'input_image', image_url: img, detail: 'high' })
  if (!content.length) throw new HttpError(400, 'Trimite text sau o imagine')

  return await structured({
    name: 'new_connection',
    schema: extractSchema,
    instructions:
      `${BRAND}\nAcum este ${nowRo()}.\n` +
      'Transformi notițe dictate, scrise sau fotografii de cărți de vizită într-o fișă de contact curată. ' +
      'Corectează greșelile de transcriere evidente, scrie numele cu diacritice corecte, normalizează telefoanele la +40. ' +
      'Nu inventa date care nu apar. Transformă orice „trebuie să…”, „sună-l…”, „trimite ofertă…” în sarcini; ' +
      'calculează datele relative („marți”, „săptămâna viitoare”) față de data de azi. ' +
      'status: „de_contactat” dacă există un follow-up, altfel „nou”.',
    input: [{ role: 'user', content }],
  })
}

// ───────────── chat (agent cu unelte) ─────────────
async function chat(supabase: Awaited<ReturnType<typeof userClient>>, body: Json) {
  const history: Json[] = (body.messages ?? [])
    .slice(-20)
    .map((m: Json) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }))
  if (!history.length) throw new HttpError(400, 'Mesaj gol')

  const ctx = { eventId: body.event_id ?? null, actions: [] as Action[], changed: { value: false } }
  const instructions =
    `${BRAND}\nEști asistentul AI din aplicația Mobilator CRM. Acum este ${nowRo()}.\n` +
    (body.event_name ? `Evenimentul curent al utilizatorului: „${body.event_name}”.\n` : '') +
    'Răspunzi mereu în română, scurt și practic (telefon mobil, pe hol la târg). ' +
    'Folosește uneltele pentru a căuta, crea și actualiza date — nu inventa contacte. ' +
    'Înainte să creezi o firmă, caută dacă există deja. După modificări confirmă pe scurt ce ai făcut. ' +
    'Pentru întâlniri sau apeluri programate folosește propose_calendar_event. ' +
    'Când utilizatorul cere „mai multe informații” despre o firmă, folosește research_company.'

  const input: Json[] = [...history]
  for (let round = 0; round < 8; round++) {
    const resp = await responses({
      instructions,
      input,
      tools: toolDefs,
      include: ['reasoning.encrypted_content'],
    })
    const calls = (resp.output ?? []).filter((o: Json) => o.type === 'function_call')
    if (!calls.length) {
      return { reply: outputText(resp), actions: ctx.actions, changed: ctx.changed.value }
    }
    input.push(...resp.output)
    for (const call of calls) {
      let output: unknown
      try {
        output = await runTool(supabase, call.name, JSON.parse(call.arguments || '{}'), ctx)
      } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) }
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) })
    }
  }
  return { reply: 'Am făcut mai mulți pași decât e permis; încearcă o cerere mai simplă.', actions: ctx.actions, changed: ctx.changed.value }
}

// ───────────── draft_email ─────────────
async function draftEmail(supabase: Awaited<ReturnType<typeof userClient>>, body: Json) {
  const { data: c, error } = await supabase
    .from('companies')
    .select('name, city, category, products, ai_summary, people(full_name, role, email), notes(body, created_at), events(name)')
    .eq('id', body.company_id)
    .single()
  if (error || !c) throw new HttpError(404, 'Compania nu a fost găsită')
  return await structured<{ subject: string; body: string }>({
    name: 'email',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'body'],
      properties: { subject: { type: 'string' }, body: { type: 'string' } },
    },
    instructions:
      `${BRAND}\nScrii un email de follow-up în română, cald dar profesionist, scurt (max 120 de cuvinte), ` +
      'după o întâlnire la un târg. Fă referire concretă la ce s-a discutat. Fără placeholder-e între paranteze. ' +
      'Semnează „Echipa Mobilator”.' + (body.intent ? ` Scopul emailului: ${body.intent}` : ''),
    input: JSON.stringify(c),
  })
}

// ───────────── router ─────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodă nepermisă' }, 405)

  try {
    const supabase = await userClient(req)

    // Audio vine ca multipart/form-data
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) throw new HttpError(400, 'Lipsește fișierul audio')
      if (file.size > 24 * 1024 * 1024) throw new HttpError(413, 'Înregistrarea e prea lungă (max ~20 min)')
      return json({ text: await transcribe(file) })
    }

    const body = await req.json()
    switch (body.action) {
      case 'extract':
        return json(await extract(body))
      case 'chat':
        return json(await chat(supabase, body))
      case 'research':
        return json(await researchCompany(supabase, body.company_id))
      case 'draft_email':
        return json(await draftEmail(supabase, body))
      case 'set_member':
        return json(await setMember(supabase, body))
      default:
        throw new HttpError(400, `Acțiune necunoscută: ${body.action}`)
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    const message = e instanceof Error ? e.message : String(e)
    console.error(status, message)
    return json({ error: message }, status)
  }
})
