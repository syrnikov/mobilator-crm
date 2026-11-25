// Registre oficiale: ANAF (România, gratuit, fără cheie) și datero.md (Moldova, pagini publice de firmă).

export interface FinancialYear {
  year: number
  revenue: number | null
  net_profit: number | null
  total_assets: number | null
  employees: number | null
  currency: 'RON' | 'MDL'
}

export interface RegistryData {
  source: 'ANAF' | 'datero.md'
  url: string
  registry_id: string
  legal_name: string | null
  legal_form: string | null
  status: string | null
  address: string | null
  city: string | null
  phone: string | null
  activity_code: string | null
  activity_name: string | null
  founded_on: string | null
  vat_payer: boolean | null
  administrators: string[]
  employees: number | null
  financials: FinancialYear[]
}

const UA = 'Mozilla/5.0 (compatible; MobilatorCRM/1.0)'

export async function fetchT(url: string, init: RequestInit = {}, ms = 9000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } })
  } finally {
    clearTimeout(t)
  }
}

export const normalizeId = (id: string | null | undefined) => (id ?? '').replace(/^RO/i, '').replace(/\D/g, '')

export function detectCountry(id: string): 'RO' | 'MD' | null {
  if (/^\d{13}$/.test(id)) return 'MD'
  if (/^\d{2,10}$/.test(id)) return 'RO'
  return null
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

// ───────────── România: ANAF ─────────────
export async function anaf(cuiRaw: string): Promise<RegistryData | null> {
  const cui = Number(normalizeId(cuiRaw))
  if (!cui) return null
  const today = new Date().toISOString().slice(0, 10)
  const thisYear = new Date().getFullYear()
  const years = [1, 2, 3, 4, 5].map((n) => thisYear - n)

  const [tvaRes, ...bilant] = await Promise.allSettled([
    fetchT('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui, data: today }]),
    }).then((r) => r.json()),
    ...years.map((an) => fetchT(`https://webservicesp.anaf.ro/bilant?an=${an}&cui=${cui}`).then((r) => r.json())),
  ])

  // deno-lint-ignore no-explicit-any
  const g: any = tvaRes.status === 'fulfilled' ? tvaRes.value?.found?.[0] : null
  const gen = g?.date_generale
  // deno-lint-ignore no-explicit-any
  const valid = bilant.filter((b): b is PromiseFulfilledResult<any> => b.status === 'fulfilled' && Array.isArray(b.value?.i) && b.value.i.length > 0)
  if (!gen && valid.length === 0) return null

  const financials: FinancialYear[] = valid
    .map(({ value }) => {
      const ind = (code: string) => {
        // deno-lint-ignore no-explicit-any
        const v = value.i.find((x: any) => x.indicator === code)?.val_indicator
        return typeof v === 'number' ? v : null
      }
      const profit = ind('I18')
      const loss = ind('I19')
      return {
        year: value.an,
        revenue: ind('I13'),
        net_profit: profit || loss ? (profit ?? 0) - (loss ?? 0) : profit,
        total_assets: (ind('I1') ?? 0) + (ind('I2') ?? 0) || null,
        employees: ind('I20'),
        currency: 'RON' as const,
      }
    })
    .filter((f) => f.revenue !== null || f.net_profit !== null)
    .sort((a, b) => a.year - b.year)

  const latestBilant = valid.sort((a, b) => b.value.an - a.value.an)[0]?.value
  const address: string | null = gen?.adresa ? titleCase(gen.adresa) : null
  const city = address?.match(/(?:Municipiul|Mun\.|Oraş|Oras|Oraș|Comuna|Sat)\s+([^,]+)/i)?.[1]?.trim() ?? null
  const inactive = g?.stare_inactiv?.statusInactivi === true

  return {
    source: 'ANAF',
    url: `https://listafirme.ro/search.asp?searchfor=${cui}`,
    registry_id: String(cui),
    legal_name: gen?.denumire ?? latestBilant?.deni ?? null,
    legal_form: gen?.forma_juridica ? titleCase(gen.forma_juridica) : null,
    status: inactive
      ? 'Inactivă fiscal'
      : /radiat/i.test(gen?.stare_inregistrare ?? '')
        ? 'Radiată'
        : /inregistrat/i.test(gen?.stare_inregistrare ?? '')
          ? 'Activă'
          : (gen?.stare_inregistrare ?? null),
    address,
    city,
    phone: gen?.telefon || null,
    activity_code: gen?.cod_CAEN || (latestBilant?.caen ? String(latestBilant.caen) : null),
    activity_name: latestBilant?.den_caen ?? null,
    founded_on: gen?.data_inregistrare || null,
    vat_payer: typeof g?.inregistrare_scop_Tva?.scpTVA === 'boolean' ? g.inregistrare_scop_Tva.scpTVA : null,
    administrators: [],
    employees: financials.at(-1)?.employees ?? null,
    financials,
  }
}

// ───────────── Moldova: datero.md ─────────────
/** Extrage obiectul/array-ul JSON echilibrat care începe la `start` ('{' sau '['). */
function balanced(t: string, start: number): string | null {
  const open = t[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  for (let i = start; i < t.length; i++) {
    const ch = t[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close && --depth === 0) return t.slice(start, i + 1)
  }
  return null
}

/** Găsește cel mai mic obiect JSON care conține `needle`. */
function enclosingObject(t: string, needle: string): Record<string, unknown> | null {
  const at = t.indexOf(needle)
  if (at < 0) return null
  let depth = 0
  for (let i = at; i >= 0; i--) {
    if (t[i] === '}') depth++
    else if (t[i] === '{') {
      if (depth === 0) {
        const s = balanced(t, i)
        try {
          return s ? JSON.parse(s) : null
        } catch {
          return null
        }
      }
      depth--
    }
  }
  return null
}

export async function datero(idnoRaw: string): Promise<RegistryData | null> {
  const idno = normalizeId(idnoRaw)
  if (!/^\d{13}$/.test(idno)) return null
  const url = `https://datero.md/ro/company/${idno}`
  const res = await fetchT(url, {}, 12000)
  if (!res.ok) return null
  const html = await res.text()

  // Payload-ul Next.js e împărțit în bucăți de string JSON
  let t = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      t += JSON.parse(`"${m[1]}"`)
    } catch {
      /* ignorăm bucățile nevalide */
    }
  }

  // deno-lint-ignore no-explicit-any
  const c: any = enclosingObject(t, `"fiscal_code":"${idno}"`) ?? {}
  // deno-lint-ignore no-explicit-any
  const extra: any = enclosingObject(t, '"company_size"') ?? {}

  // deno-lint-ignore no-explicit-any
  let years: any[] = []
  const yi = t.indexOf('"years":[')
  if (yi >= 0) {
    try {
      years = JSON.parse(balanced(t, yi + 8) ?? '[]')
    } catch {
      years = []
    }
  }

  // Fallback: JSON-LD (nume, adresă, dată înființare)
  // deno-lint-ignore no-explicit-any
  let ld: any = null
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1])
      if (j.identifier === idno) ld = j
    } catch {
      /* skip */
    }
  }
  if (!c.fiscal_code && !ld && years.length === 0) return null

  // deno-lint-ignore no-explicit-any
  const acts: any[] = Array.isArray(c.activities) ? c.activities : []
  const address: string | null = c.address ?? ld?.address?.streetAddress ?? null
  const city = ld?.address?.addressLocality ?? address?.match(/mun\.\s*([^,]+)/i)?.[1]?.trim() ?? null
  const financials: FinancialYear[] = years
    .map((y) => ({
      year: Number(y.year),
      revenue: y.revenue ?? null,
      net_profit: y.net_profit ?? null,
      total_assets: y.total_assets ?? null,
      employees: y.employees ?? null,
      currency: 'MDL' as const,
    }))
    .filter((f) => f.year && (f.revenue !== null || f.net_profit !== null))
    .sort((a, b) => a.year - b.year)
    .slice(-6)

  const status: Record<string, string> = { active: 'Activă', inactive: 'Inactivă', liquidated: 'Lichidată', liquidation: 'În lichidare' }
  return {
    source: 'datero.md',
    url,
    registry_id: idno,
    legal_name: ld?.name ?? c.name ?? null,
    legal_form: c.legal_form ?? null,
    status: c.status ? (status[c.status] ?? c.status) : null,
    address,
    city: city ? titleCase(city) : null,
    phone: null, // datero ține contactele în spatele planului plătit
    activity_code: acts[0]?.caem_code ?? null,
    activity_name: acts[0]?.name ?? null,
    founded_on: c.registration_date ?? ld?.foundingDate ?? null,
    vat_payer: null,
    // deno-lint-ignore no-explicit-any
    administrators: Array.isArray(c.administrators) ? c.administrators.map((a: any) => titleCase(a.full_name)).filter(Boolean) : [],
    employees: extra.employees ?? financials.at(-1)?.employees ?? null,
    financials,
  }
}

export async function lookupRegistry(id: string, country: string | null): Promise<RegistryData | null> {
  const n = normalizeId(id)
  const c = (country === 'RO' || country === 'MD' ? country : null) ?? detectCountry(n)
  try {
    if (c === 'MD') return await datero(n)
    if (c === 'RO') return await anaf(n)
  } catch (e) {
    console.error('registry', e)
  }
  return null
}
