// Cercetare firmă în 4 pași: identificare (AI + web) → registru oficial → site → rezumat.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { structured } from './openai.ts'
import { detectCountry, fetchT, lookupRegistry, normalizeId, type FinancialYear, type RegistryData } from './registry.ts'
import { scrapeSite } from './scrape.ts'

const nul = (t: string) => ({ type: [t, 'null'] })

const identifySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'country', 'registry_id', 'legal_name', 'website', 'phones', 'emails', 'address', 'city', 'category', 'products', 'socials', 'notes', 'sources'],
  properties: {
    found: { type: 'boolean', description: 'true doar dacă firma a fost identificată cu încredere' },
    country: { type: ['string', 'null'], enum: ['RO', 'MD', 'OTHER', null] },
    registry_id: { ...nul('string'), description: 'RO: CUI (doar cifre, fără RO). MD: IDNO (13 cifre).' },
    legal_name: nul('string'),
    website: nul('string'),
    phones: { type: 'array', items: { type: 'string' }, description: 'telefoane de business, format internațional' },
    emails: { type: 'array', items: { type: 'string' } },
    address: nul('string'),
    city: nul('string'),
    category: { ...nul('string'), description: 'ex: producător mobilier, furnizor PAL/MDF, feronerie, CNC, tapițerie' },
    products: { type: 'array', items: { type: 'string' } },
    socials: {
      type: 'object',
      additionalProperties: false,
      required: ['facebook', 'instagram', 'linkedin'],
      properties: { facebook: nul('string'), instagram: nul('string'), linkedin: nul('string') },
    },
    notes: { ...nul('string'), description: 'alte informații relevante găsite: clienți, export, certificări, showroom, mărime' },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

type Identify = {
  found: boolean
  country: 'RO' | 'MD' | 'OTHER' | null
  registry_id: string | null
  legal_name: string | null
  website: string | null
  phones: string[]
  emails: string[]
  address: string | null
  city: string | null
  category: string | null
  products: string[]
  socials: { facebook: string | null; instagram: string | null; linkedin: string | null }
  notes: string | null
  sources: string[]
}


export async function researchCompany(supabase: SupabaseClient, companyId: string) {
  const { data: c, error } = await supabase.from('companies').select('*, people(full_name, role)').eq('id', companyId).single()
  if (error || !c) throw new Error('Compania nu a fost găsită')

  // ── 1. Identificare (AI + căutare web)
  const known = normalizeId(c.registry_id)
  const id = await structured<Identify>({
    name: 'company_identify',
    schema: identifySchema,
    tools: [{ type: 'web_search' }],
    instructions:
      'Ești cercetătorul Mobilator (producător român de mobilier la comandă). Identifică firma de mai jos și adună date publice verificate.\n' +
      '• România: caută codul fiscal (CUI) pe listafirme.ro, termene.ro, risco.ro sau openapi.ro.\n' +
      '• Moldova: caută IDNO (13 cifre, de obicei începe cu 100) pe datero.md, idno.md sau srl.md.\n' +
      '• Caută site-ul oficial și pagina de contact: telefoane de business, email, adresă, rețele sociale.\n' +
      '• Folosește orașul, persoanele și produsele ca să alegi firma corectă dacă există mai multe cu nume similar.\n' +
      'Nu inventa nimic: dacă nu ești sigur, pune null. Răspunde în română.',
    input: JSON.stringify({
      nume: c.name,
      denumire_legala: c.legal_name,
      cod_fiscal_cunoscut: known || null,
      oras: c.city,
      tara: c.country,
      website: c.website,
      categorie: c.category,
      produse: c.products,
      persoane: c.people,
      etichete: c.tags,
    }),
  })

  // ── 2. Registru oficial (ANAF / datero.md)
  const registryId = known || normalizeId(id.registry_id)
  const country = id.country === 'RO' || id.country === 'MD' ? id.country : detectCountry(registryId)
  const [reg, site] = await Promise.all([
    registryId ? lookupRegistry(registryId, country) : Promise.resolve(null),
    // ── 3. Site-ul firmei
    (c.website || id.website) ? scrapeSite(c.website || id.website).catch(() => null) : Promise.resolve(null),
  ])

  // ── 4. Rezumat cu toate datele
  const summary = await summarize(c, id, reg)

  // ── Îmbinare: nu suprascriem ce a scris echipa; datele de registru se reîmprospătează mereu
  const phones = uniq([...(reg?.phone ? [reg.phone] : []), ...id.phones, ...(site?.phones ?? [])])
  const emails = uniq([...id.emails, ...(site?.emails ?? [])].map((e) => e.toLowerCase()))
  const website = c.website || id.website
  const socials = {
    ...Object.fromEntries(Object.entries(id.socials).filter(([, v]) => v)),
    ...(site?.socials ?? {}),
    ...(c.socials ?? {}),
  }

  const patch: Record<string, unknown> = {
    enriched_at: new Date().toISOString(),
    socials,
  }
  if (summary) patch.ai_summary = summary
  if (!c.website && website) patch.website = website
  if (!c.category && id.category) patch.category = id.category
  if ((!c.products || c.products.length === 0) && id.products.length) patch.products = id.products
  if (!c.city && (reg?.city || id.city)) patch.city = reg?.city || id.city
  if (!c.address && (reg?.address || id.address)) patch.address = reg?.address || id.address
  if (!c.phone && phones[0]) patch.phone = phones[0]
  if (!c.email && emails[0]) patch.email = emails[0]
  if (!c.country || c.country === 'România') {
    if (country === 'MD') patch.country = 'Moldova'
    else if (country === 'RO') patch.country = 'România'
  }
  if (registryId && (reg || !c.registry_id)) patch.registry_id = registryId
  if (id.legal_name && !reg) patch.legal_name = id.legal_name

  if (reg) {
    Object.assign(patch, {
      legal_name: reg.legal_name ?? id.legal_name,
      legal_form: reg.legal_form,
      registry_status: reg.status,
      activity_code: reg.activity_code,
      activity_name: reg.activity_name,
      founded_on: reg.founded_on,
      employees: reg.employees,
      vat_payer: reg.vat_payer,
      administrators: reg.administrators,
      financials: reg.financials,
      registry_source: reg.source,
      registry_url: reg.url,
    })
  }

  if (website) {
    patch.domain = domainOf(website)
    if (!c.logo_url) {
      const logo = await fetchLogo(supabase, companyId, website).catch(() => null)
      if (logo) patch.logo_url = logo
    }
  }

  const { error: upErr } = await supabase.from('companies').update(patch).eq('id', companyId)
  if (upErr) throw new Error(upErr.message)

  // Contacte suplimentare și alte informații → notiță AI (doar dacă e ceva nou)
  const extraPhones = phones.filter((p) => p !== (patch.phone ?? c.phone))
  const extraEmails = emails.filter((e) => e !== (patch.email ?? c.email))
  const lines = [
    extraPhones.length ? `• Alte telefoane: ${extraPhones.join(', ')}` : '',
    extraEmails.length ? `• Alte emailuri: ${extraEmails.join(', ')}` : '',
    id.notes ? `• ${id.notes}` : '',
  ].filter(Boolean)
  if (lines.length) {
    await supabase.from('notes').insert({ company_id: companyId, body: `Găsit la cercetare:\n${lines.join('\n')}`, source: 'ai' })
  }

  return {
    found: id.found || !!reg,
    summary,
    registry: reg ? { source: reg.source, id: reg.registry_id, years: reg.financials.length } : null,
    other_phones: phones.slice(1),
    other_emails: emails.slice(1),
    notes: id.notes,
    sources: [...id.sources, ...(reg ? [reg.url] : [])],
    updated: Object.keys(patch),
  }
}

const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))]

const fmtMoney = (n: number | null, cur: string) =>
  n === null ? '—' : `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(n)} ${cur}`

async function summarize(
  // deno-lint-ignore no-explicit-any
  c: any,
  id: Identify,
  reg: RegistryData | null,
): Promise<string | null> {
  const fin = (reg?.financials ?? []).map((f: FinancialYear) =>
    `${f.year}: cifră de afaceri ${fmtMoney(f.revenue, f.currency)}, profit net ${fmtMoney(f.net_profit, f.currency)}${f.employees ? `, ${f.employees} angajați` : ''}`,
  )
  if (!id.found && !reg) return null
  const r = await structured<{ summary: string }>({
    name: 'summary',
    schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } },
    instructions:
      'Scrie în română un rezumat de 3-5 propoziții despre firmă pentru echipa Mobilator (producător de mobilier la comandă): ' +
      'ce face, de când există și cât de mare e, evoluția cifrei de afaceri și a profitului (cu cifre rotunjite, ex. „4,6 mil. MDL”), ' +
      'și de ce ar putea fi relevantă (furnizor, client, colaborator). Fără liste, fără inventii — folosește doar datele primite.',
    input: JSON.stringify({
      nume: c.name,
      denumire_legala: reg?.legal_name ?? id.legal_name,
      tara: reg?.source === 'datero.md' ? 'Moldova' : reg?.source === 'ANAF' ? 'România' : id.country,
      activitate: reg?.activity_name ?? id.category,
      produse: id.products.length ? id.products : c.products,
      infiintata: reg?.founded_on,
      stare: reg?.status,
      administratori: reg?.administrators,
      financiar: fin,
      alte_informatii: id.notes,
      rezumat_anterior: c.ai_summary,
    }),
  })
  return r.summary
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Găsește logo-ul firmei (apple-touch-icon → icon mare → favicon), îl urcă în bucket-ul `logos`. */
export async function fetchLogo(supabase: SupabaseClient, companyId: string, website: string): Promise<string | null> {
  const base = website.startsWith('http') ? website : `https://${website}`
  const candidates: string[] = []

  try {
    const html = await (await fetchT(base, {}, 7000)).text()
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
    const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    const scored = links
      .map((tag) => {
        const rel = (attr(tag, 'rel') ?? '').toLowerCase()
        const href = attr(tag, 'href')
        if (!href || !rel.includes('icon')) return null
        const size = parseInt((attr(tag, 'sizes') ?? '0').split('x')[0]) || 0
        const score = (rel.includes('apple-touch') ? 1000 : 0) + size + (href.endsWith('.svg') ? -2000 : 0)
        return { href: new URL(href, base).toString(), score }
      })
      .filter((x): x is { href: string; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
    candidates.push(...scored.map((s) => s.href))
  } catch {
    /* site indisponibil — trecem la fallback */
  }

  const domain = domainOf(base)
  if (domain) candidates.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)

  for (const url of candidates) {
    try {
      const res = await fetchT(url, {}, 7000)
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length < 300) continue
      const ext = type.includes('png') ? 'png' : type.includes('svg') ? 'svg' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'ico'
      const path = `${companyId}.${ext}`
      const { error } = await supabase.storage.from('logos').upload(path, bytes, { contentType: type, upsert: true })
      if (error) continue
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      return `${data.publicUrl}?v=${Date.now()}`
    } catch {
      continue
    }
  }
  return null
}
