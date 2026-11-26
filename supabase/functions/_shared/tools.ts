import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { researchCompany } from './research.ts'
import { MODEL, outputText, responses } from './openai.ts'

const STATUS = ['nou', 'de_contactat', 'in_discutii', 'colaborator', 'arhivat']

const str = (description?: string) => ({ type: 'string', description })

export const toolDefs = [
  {
    type: 'function',
    name: 'search_contacts',
    description: 'Caută firme/persoane în CRM după text liber (nume, oraș, produse, notițe). Gol = cele mai recente.',
    parameters: {
      type: 'object',
      properties: {
        query: str('termeni de căutare'),
        status: { type: 'string', enum: STATUS },
        event_id: str('filtrează după eveniment'),
      },
    },
  },
  {
    type: 'function',
    name: 'get_company',
    description: 'Fișa completă a unei firme: date, persoane, notițe, sarcini.',
    parameters: { type: 'object', properties: { company_id: str() }, required: ['company_id'] },
  },
  {
    type: 'function',
    name: 'create_company',
    description:
      'Creează o firmă nouă (conexiune). Verifică întâi cu search_contacts dacă nu există deja. Poate include persoane, o notiță și sarcini.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: str(),
        website: str(),
        category: str(),
        products: { type: 'array', items: { type: 'string' } },
        city: str(),
        phone: str(),
        email: str(),
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: STATUS },
        note: str('notiță curată despre discuție'),
        people: {
          type: 'array',
          items: {
            type: 'object',
            required: ['full_name'],
            properties: { full_name: str(), role: str(), phone: str(), email: str() },
          },
        },
        tasks: {
          type: 'array',
          items: { type: 'object', required: ['title'], properties: { title: str(), due_at: str('ISO 8601') } },
        },
      },
    },
  },
  {
    type: 'function',
    name: 'update_company',
    description: 'Actualizează câmpuri ale unei firme (doar cele trimise).',
    parameters: {
      type: 'object',
      required: ['company_id'],
      properties: {
        company_id: str(),
        name: str(),
        website: str(),
        category: str(),
        products: { type: 'array', items: { type: 'string' } },
        city: str(),
        address: str(),
        phone: str(),
        email: str(),
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: STATUS },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  {
    type: 'function',
    name: 'add_person',
    description: 'Adaugă o persoană de contact la o firmă.',
    parameters: {
      type: 'object',
      required: ['company_id', 'full_name'],
      properties: { company_id: str(), full_name: str(), role: str(), phone: str(), email: str(), linkedin: str() },
    },
  },
  {
    type: 'function',
    name: 'add_note',
    description: 'Adaugă o notiță la o firmă.',
    parameters: { type: 'object', required: ['company_id', 'body'], properties: { company_id: str(), body: str() } },
  },
  {
    type: 'function',
    name: 'add_task',
    description: 'Adaugă o sarcină / follow-up în checklist-ul unei firme.',
    parameters: {
      type: 'object',
      required: ['company_id', 'title'],
      properties: { company_id: str(), title: str(), due_at: str('ISO 8601, ora României') },
    },
  },
  {
    type: 'function',
    name: 'complete_task',
    description: 'Bifează (sau debifează) o sarcină.',
    parameters: {
      type: 'object',
      required: ['task_id'],
      properties: { task_id: str(), done: { type: 'boolean' } },
    },
  },
  {
    type: 'function',
    name: 'list_open_tasks',
    description: 'Lista sarcinilor nebifate din toată echipa, cu termen și firmă.',
    parameters: { type: 'object', properties: { until: str('ISO 8601 — doar sarcinile cu termen până la') } },
  },
  {
    type: 'function',
    name: 'list_events',
    description: 'Lista evenimentelor (târguri, întâlniri) din CRM.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'propose_calendar_event',
    description:
      'Propune un eveniment în calendarul telefonului (întâlnire, apel, vizită). Utilizatorul îl confirmă cu un buton.',
    parameters: {
      type: 'object',
      required: ['title', 'start'],
      properties: {
        title: str(),
        start: str('ISO 8601 cu fus orar'),
        end: str('ISO 8601 cu fus orar'),
        location: str(),
        description: str(),
        company_id: str(),
      },
    },
  },
  {
    type: 'function',
    name: 'research_company',
    description: 'Caută pe web informații despre o firmă din CRM și completează fișa (website, logo, rezumat, produse).',
    parameters: { type: 'object', required: ['company_id'], properties: { company_id: str() } },
  },
  {
    type: 'function',
    name: 'analyze_company_media',
    description:
      'Analizează vizual pozele încărcate la o firmă (secțiunea „Poze & video”) și cărțile de vizită. Folosește când utilizatorul cere să „scanezi”/„analizezi” pozele unei firme. Videoclipurile nu pot fi analizate.',
    parameters: {
      type: 'object',
      required: ['company_id'],
      properties: { company_id: str(), question: str('ce anume să urmărești în poze (opțional)') },
    },
  },
]

export type Action =
  | { type: 'calendar'; event: Record<string, string | undefined> }
  | { type: 'company'; id: string; name: string }

// deno-lint-ignore no-explicit-any
type Args = Record<string, any>

const clean = <T extends Args>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>

export async function runTool(
  supabase: SupabaseClient,
  name: string,
  args: Args,
  ctx: { eventId: string | null; actions: Action[]; changed: { value: boolean } },
): Promise<unknown> {
  const must = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
    return r.data
  }

  switch (name) {
    case 'search_contacts': {
      let q = supabase
        .rpc('search_companies', { q: args.query ?? '', max_results: 25 })
        .select('id, name, city, category, status, phone, event_id, tags, people(full_name, role, phone)')
      if (args.status) q = q.eq('status', args.status)
      if (args.event_id) q = q.eq('event_id', args.event_id)
      return must(await q)
    }
    case 'get_company': {
      const c = must(
        await supabase
          .from('companies')
          .select('*, people(*), notes(body, source, created_at), tasks(id, title, done, due_at), events(name)')
          .eq('id', args.company_id)
          .single(),
      )
      return c
    }
    case 'create_company': {
      const { people = [], tasks = [], note, ...rest } = args
      const company = must(
        await supabase
          .from('companies')
          .insert({ ...clean(rest), event_id: ctx.eventId })
          .select('id, name')
          .single(),
      ) as { id: string; name: string }
      if (people.length)
        must(await supabase.from('people').insert(people.map((p: Args) => ({ ...clean(p), company_id: company.id }))))
      if (note) must(await supabase.from('notes').insert({ company_id: company.id, body: note, source: 'ai' }))
      if (tasks.length)
        must(await supabase.from('tasks').insert(tasks.map((t: Args) => ({ ...clean(t), company_id: company.id }))))
      ctx.actions.push({ type: 'company', id: company.id, name: company.name })
      ctx.changed.value = true
      return company
    }
    case 'update_company': {
      const { company_id, ...rest } = args
      const c = must(
        await supabase.from('companies').update(clean(rest)).eq('id', company_id).select('id, name').single(),
      ) as { id: string; name: string }
      ctx.actions.push({ type: 'company', id: c.id, name: c.name })
      ctx.changed.value = true
      return c
    }
    case 'add_person':
      ctx.changed.value = true
      return must(await supabase.from('people').insert(clean(args)).select('id').single())
    case 'add_note':
      ctx.changed.value = true
      return must(
        await supabase.from('notes').insert({ company_id: args.company_id, body: args.body, source: 'ai' }).select('id').single(),
      )
    case 'add_task':
      ctx.changed.value = true
      return must(await supabase.from('tasks').insert(clean(args)).select('id').single())
    case 'complete_task':
      ctx.changed.value = true
      return must(
        await supabase.from('tasks').update({ done: args.done ?? true }).eq('id', args.task_id).select('id, done').single(),
      )
    case 'list_open_tasks': {
      let q = supabase
        .from('tasks')
        .select('id, title, due_at, companies(id, name)')
        .eq('done', false)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(50)
      if (args.until) q = q.lte('due_at', args.until)
      return must(await q)
    }
    case 'list_events':
      return must(await supabase.from('events').select('id, name, city, starts_on, ends_on').order('starts_on', { ascending: false }))
    case 'propose_calendar_event':
      ctx.actions.push({ type: 'calendar', event: args })
      return { ok: true, info: 'Propunerea a fost afișată utilizatorului cu buton de adăugare în calendar.' }
    case 'research_company': {
      const r = await researchCompany(supabase, args.company_id)
      ctx.changed.value = true
      return r
    }
    case 'analyze_company_media': {
      const c = must(
        await supabase.from('companies').select('name, media, card_images').eq('id', args.company_id).single(),
      ) as { name: string; media: string[] | null; card_images: string[] | null }
      const all = [...(c.media ?? []), ...(c.card_images ?? [])]
      const images = all.filter((p) => /\.(jpe?g|png|webp|gif)$/i.test(p)).slice(0, 10)
      const videos = all.length - all.filter((p) => /\.(jpe?g|png|webp|gif)$/i.test(p)).length
      if (!images.length) return { info: `Firma ${c.name} nu are poze încărcate${videos ? ` (doar ${videos} video, care nu pot fi analizate)` : ''}.` }
      const { data, error } = await supabase.storage.from('carti').createSignedUrls(images, 600)
      if (error) throw new Error(error.message)
      const urls = (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[]
      const resp = await responses({
        model: MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  `Poze de la firma „${c.name}”, încărcate de echipa Mobilator (producător de mobilier la comandă). ` +
                  'Descrie pe scurt, în română, ce se vede în fiecare poză (produse, materiale, finisaje, stil, calitate, text vizibil, date de contact) ' +
                  'și ce înseamnă pentru o posibilă colaborare. ' +
                  (args.question ? `Urmărește în special: ${args.question}` : ''),
              },
              ...urls.map((u) => ({ type: 'input_image', image_url: u })),
            ],
          },
        ],
      })
      return { images: urls.length, videos_skipped: videos, analysis: outputText(resp) }
    }
    default:
      throw new Error(`Unealtă necunoscută: ${name}`)
  }
}
