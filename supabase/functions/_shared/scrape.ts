// Contacte de pe site-ul firmei: telefon, email, rețele sociale (pagina principală + pagina de contact).
import { fetchT } from './registry.ts'

export interface SiteContacts {
  phones: string[]
  emails: string[]
  socials: Record<string, string>
}

const SOCIAL: [string, RegExp][] = [
  ['facebook', /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|plugins|dialog|tr\b)[^"'\s<>?#]+/i],
  ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[^"'\s<>?#]+/i],
  ['linkedin', /https?:\/\/(?:[a-z]{2}\.|www\.)?linkedin\.com\/company\/[^"'\s<>?#]+/i],
  ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[^"'\s<>?#]+/i],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/@[^"'\s<>?#]+/i],
]

const decode = (s: string) => s.replace(/&#64;|&commat;/g, '@').replace(/&amp;/g, '&').replace(/%20/g, ' ')

function extract(html: string, into: SiteContacts) {
  const h = decode(html)
  for (const m of h.matchAll(/href=["']tel:([^"']+)["']/gi)) into.phones.push(m[1])
  for (const m of h.matchAll(/href=["']mailto:([^"'?]+)/gi)) into.emails.push(m[1])
  // numere scrise în text (RO +40 / MD +373)
  const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  for (const m of text.matchAll(/(?:\+|00)(?:40|373)[\s.\-()]*\d(?:[\s.\-()]*\d){6,9}|\b0[2-7]\d(?:[\s.\-]*\d){6,7}\b/g)) into.phones.push(m[0])
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) into.emails.push(m[0])
  for (const [name, re] of SOCIAL) if (!into.socials[name]) {
    const m = h.match(re)
    if (m) into.socials[name] = m[0].replace(/\/$/, '')
  }
}

const normPhone = (p: string) => {
  const d = p.replace(/[^\d+]/g, '').replace(/^00/, '+')
  return d.startsWith('+') ? d : d.startsWith('0') ? d : d
}

export async function scrapeSite(website: string): Promise<SiteContacts> {
  const out: SiteContacts = { phones: [], emails: [], socials: {} }
  const base = website.startsWith('http') ? website : `https://${website}`
  let home = ''
  try {
    const r = await fetchT(base, {}, 8000)
    if (r.ok && (r.headers.get('content-type') ?? '').includes('html')) home = await r.text()
  } catch {
    return out
  }
  extract(home, out)

  // pagina de contact: link găsit pe home sau căi uzuale
  const linked = [...home.matchAll(/href=["']([^"'#]*(?:contact|contacte|kontakt|despre)[^"'#]*)["']/gi)].map((m) => m[1])
  const candidates = [...new Set([...linked.slice(0, 2), '/contact', '/contacte'])]
  for (const path of candidates.slice(0, 3)) {
    try {
      const r = await fetchT(new URL(path, base).toString(), {}, 7000)
      if (r.ok && (r.headers.get('content-type') ?? '').includes('html')) {
        extract(await r.text(), out)
        break
      }
    } catch {
      /* încercăm următoarea */
    }
  }

  const domain = new URL(base).hostname.replace(/^www\./, '')
  const junk = /(example|sentry|wixpress|domain|email|yourname|\.png|\.jpg|\.webp)/i
  out.emails = [...new Set(out.emails.map((e) => e.trim().toLowerCase()))]
    .filter((e) => !junk.test(e))
    .sort((a, b) => Number(b.endsWith(domain)) - Number(a.endsWith(domain)))
    .slice(0, 4)
  out.phones = [...new Set(out.phones.map(normPhone))].filter((p) => p.replace(/\D/g, '').length >= 9).slice(0, 4)
  return out
}
