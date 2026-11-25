import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { structured } from './openai.ts'

const researchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'website', 'summary', 'category', 'products', 'city', 'country', 'address', 'phone', 'email', 'sources'],
  properties: {
    found: { type: 'boolean', description: 'true dacă firma a fost identificată cu încredere' },
    website: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'], description: '2-4 propoziții în română: ce face firma, mărime, specific, relevanță pentru Mobilator' },
    category: { type: ['string', 'null'], description: 'ex: producător mobilier, furnizor PAL/MDF, feronerie, CNC, tapițerie, retail' },
    products: { type: 'array', items: { type: 'string' } },
    city: { type: ['string', 'null'] },
    country: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

type Research = {
  found: boolean
  website: string | null
  summary: string | null
  category: string | null
  products: string[]
  city: string | null
  country: string | null
  address: string | null
  phone: string | null
  email: string | null
  sources: string[]
}

export async function researchCompany(supabase: SupabaseClient, companyId: string) {
  const { data: c, error } = await supabase.from('companies').select('*, people(full_name, role)').eq('id', companyId).single()
  if (error || !c) throw new Error('Compania nu a fost găsită')

  const r = await structured<Research>({
    name: 'company_research',
    schema: researchSchema,
    tools: [{ type: 'web_search' }],
    instructions:
      'Ești asistentul de cercetare al Mobilator (producător de mobilier la comandă din România). ' +
      'Caută pe web firma indicată și întoarce date verificate. Nu inventa: dacă nu ești sigur, pune null. ' +
      'Scrie rezumatul în română, concis și util pentru o discuție de colaborare.',
    input: JSON.stringify({
      nume: c.name,
      oras: c.city,
      website: c.website,
      categorie: c.category,
      persoane: c.people,
      tags: c.tags,
    }),
  })

  // Completăm doar câmpurile goale — nu suprascriem ce a introdus echipa.
  const patch: Record<string, unknown> = {}
  if (r.summary) patch.ai_summary = r.summary
  if (!c.website && r.website) patch.website = r.website
  if (!c.category && r.category) patch.category = r.category
  if ((!c.products || c.products.length === 0) && r.products.length) patch.products = r.products
  if (!c.city && r.city) patch.city = r.city
  if (!c.address && r.address) patch.address = r.address
  if (!c.phone && r.phone) patch.phone = r.phone
  if (!c.email && r.email) patch.email = r.email
  if (r.country) patch.country = c.country || r.country

  const website = (patch.website as string) ?? c.website
  if (website) {
    patch.domain = domainOf(website)
    if (!c.logo_url) {
      const logo = await fetchLogo(supabase, companyId, website).catch(() => null)
      if (logo) patch.logo_url = logo
    }
  }

  if (Object.keys(patch).length) {
    const { error: upErr } = await supabase.from('companies').update(patch).eq('id', companyId)
    if (upErr) throw new Error(upErr.message)
  }
  return { ...r, updated: Object.keys(patch) }
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

async function fetchWithTimeout(url: string, ms = 7000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MobilatorCRM/1.0)' } })
  } finally {
    clearTimeout(t)
  }
}

/** Găsește logo-ul firmei (apple-touch-icon → icon mare → favicon), îl urcă în bucket-ul `logos`. */
export async function fetchLogo(supabase: SupabaseClient, companyId: string, website: string): Promise<string | null> {
  const base = website.startsWith('http') ? website : `https://${website}`
  const candidates: string[] = []

  try {
    const html = await (await fetchWithTimeout(base)).text()
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
      const res = await fetchWithTimeout(url)
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length < 300) continue // favicon gol / pixel
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
