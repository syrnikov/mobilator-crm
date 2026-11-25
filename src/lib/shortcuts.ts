// Scurtături de sistem: apel, WhatsApp, email, hărți, calendar (.ics), agendă (.vcf), share.
import type { Company, Person } from './types'

/** Normalizează la E.164; implicit România (+40). */
export function e164(phone: string | null | undefined): string | null {
  if (!phone) return null
  let p = phone.replace(/[^\d+]/g, '')
  if (!p) return null
  if (p.startsWith('00')) p = '+' + p.slice(2)
  else if (p.startsWith('0')) p = '+40' + p.slice(1)
  else if (!p.startsWith('+')) p = (p.startsWith('40') && p.length === 11 ? '+' : '+40') + p
  return p
}

export const telUrl = (phone: string) => `tel:${e164(phone)}`
export const whatsappUrl = (phone: string, text?: string) =>
  `https://wa.me/${(e164(phone) ?? '').replace('+', '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
export const mailtoUrl = (to: string | null, subject = '', body = '') =>
  `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
export const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
export const webUrl = (site: string) => (site.startsWith('http') ? site : `https://${site}`)

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent)

/** Pe mobil, preferă foaia de share (iOS → „Adaugă în Calendar/Contacte”); altfel descarcă. */
export async function shareOrDownload(filename: string, content: string, type: string) {
  const file = new File([content], filename, { type })
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  download(filename, content, type)
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'mobilator'

// ───────────── Calendar ─────────────
export interface CalEvent {
  title: string
  start: Date
  end?: Date
  location?: string
  description?: string
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')

export function buildIcs(ev: CalEvent): string {
  const end = ev.end ?? new Date(ev.start.getTime() + 30 * 60000)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mobilator//CRM//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@mobilator`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : '',
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(ev.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export const addToCalendar = (ev: CalEvent) => shareOrDownload(`${slug(ev.title)}.ics`, buildIcs(ev), 'text/calendar')

export function googleCalendarUrl(ev: CalEvent) {
  const end = ev.end ?? new Date(ev.start.getTime() + 30 * 60000)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${icsDate(ev.start)}/${icsDate(end)}`,
    details: ev.description ?? '',
    location: ev.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${p}`
}

// ───────────── vCard ─────────────
export function buildVcard(person: Pick<Person, 'full_name' | 'role' | 'phone' | 'email'> | null, company: Company): string {
  const name = person?.full_name ?? company.name
  const parts = name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  const first = parts.join(' ')
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(name)}`,
    `ORG:${esc(company.name)}`,
    person?.role ? `TITLE:${esc(person.role)}` : '',
    person?.phone ? `TEL;TYPE=CELL:${e164(person.phone)}` : '',
    company.phone && company.phone !== person?.phone ? `TEL;TYPE=WORK:${e164(company.phone)}` : '',
    person?.email ? `EMAIL;TYPE=INTERNET:${person.email}` : '',
    company.email && company.email !== person?.email ? `EMAIL;TYPE=WORK:${company.email}` : '',
    company.website ? `URL:${webUrl(company.website)}` : '',
    company.address || company.city
      ? `ADR;TYPE=WORK:;;${esc(company.address ?? '')};${esc(company.city ?? '')};;;${esc(company.country ?? '')}`
      : '',
    `NOTE:${esc('Adăugat din Mobilator CRM' + (company.category ? ` — ${company.category}` : ''))}`,
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export const saveContact = (person: Person | null, company: Company) =>
  shareOrDownload(`${slug(person?.full_name ?? company.name)}.vcf`, buildVcard(person, company), 'text/vcard')

/** Share nativ; fallback: copiere în clipboard. Întoarce 'shared' | 'copied' | 'cancelled'. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
