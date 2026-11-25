import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarSheet } from '../components/CalendarSheet'
import { FinancialsCard, RegistryCard, SocialLinks } from '../components/CompanyFacts'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/Layout'
import { CompanyLogo, Empty, errText, fmtDateTime, fmtDue, fromLocalInput, Sheet, useToast, Working } from '../components/ui'
import { draftEmail, researchCompany, transcribeAudio } from '../lib/ai'
import { deleteCompany, uploadLogo, useCompany, useInvalidate, useRowMutations, useUpdateCompany } from '../lib/api'
import { fmtSeconds, imageToPng, useRecorder } from '../lib/media'
import { mailtoUrl, mapsUrl, saveContact, shareText, telUrl, webUrl, whatsappUrl, type CalEvent } from '../lib/shortcuts'
import { STATUS_LABEL, STATUSES, type Company, type CompanyFull, type Person } from '../lib/types'

const SOURCE_LABEL = { text: 'scris', voce: 'dictat', ai: 'AI', scanare: 'carte de vizită' } as const

export function Firma() {
  const { id } = useParams()
  const { data: c, isLoading, error } = useCompany(id)
  const [calendar, setCalendar] = useState<(Partial<CalEvent> & { title: string }) | null>(null)
  const [editing, setEditing] = useState(false)
  const [person, setPerson] = useState<Partial<Person> | null>(null)
  const [busy, setBusy] = useState('')
  const toast = useToast()
  const nav = useNavigate()
  const invalidate = useInvalidate()

  if (isLoading)
    return (
      <>
        <TopBar back title=" " />
        <main className="page">
          <Working label="Se încarcă" />
        </main>
      </>
    )
  if (error || !c)
    return (
      <>
        <TopBar back title="Firmă" />
        <main className="page">
          <div className="banner">{error ? (error as Error).message : 'Firma nu există.'}</div>
        </main>
      </>
    )

  const phone = c.phone ?? c.people.find((p) => p.phone)?.phone ?? null
  const email = c.email ?? c.people.find((p) => p.email)?.email ?? null
  const mapQuery = [c.address, c.city, c.name].filter(Boolean).join(', ')

  async function research() {
    const steps = ['Caut firma pe web…', 'Verific registrul oficial…', 'Citesc site-ul firmei…', 'Scriu rezumatul…']
    let i = 0
    setBusy(steps[0])
    const timer = setInterval(() => setBusy(steps[Math.min(++i, steps.length - 1)]), 9000)
    try {
      const r = await researchCompany(c!.id)
      invalidate(c!.id)
      toast(
        !r.found
          ? 'Nu am găsit informații sigure despre firmă. Adaugă CUI/IDNO din Editează și încearcă din nou.'
          : r.registry
            ? `Fișă completată din ${r.registry.source}${r.registry.years ? ` · ${r.registry.years} ani de date financiare` : ''}`
            : 'Fișă completată de pe web (fără registru oficial)',
      )
    } catch (e) {
      toast(errText(e), true)
    } finally {
      clearInterval(timer)
      setBusy('')
    }
  }

  async function email_() {
    setBusy('Scriu emailul de follow-up…')
    try {
      const d = await draftEmail(c!.id)
      window.location.href = mailtoUrl(email, d.subject, d.body)
    } catch (e) {
      toast(errText(e), true)
    } finally {
      setBusy('')
    }
  }

  async function share() {
    const lines = [
      c!.name,
      c!.category,
      c!.city,
      ...c!.people.map((p) => [p.full_name, p.role, p.phone, p.email].filter(Boolean).join(' · ')),
      c!.phone,
      c!.email,
      c!.website,
      c!.ai_summary,
    ].filter(Boolean)
    const r = await shareText(c!.name, lines.join('\n'))
    if (r === 'copied') toast('Copiat în clipboard')
  }

  return (
    <>
      <TopBar
        back
        title={c.name}
        right={
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editează">
            <Icon name="edit" />
          </button>
        }
      />
      <main className="page">
        <div className="hero">
          <label style={{ position: 'relative', cursor: 'pointer' }} aria-label="Schimbă logo-ul">
            <CompanyLogo name={c.name} url={c.logo_url} size="lg" />
            <span className="logo-edit"><Icon name="camera" size={14} /></span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  await uploadLogo(c.id, await imageToPng(f))
                  invalidate(c.id)
                  toast('Logo actualizat')
                } catch (err) {
                  toast(errText(err), true)
                }
              }}
            />
          </label>
          <div className="grow">
            <h1>{c.name}</h1>
            <div className="mute" style={{ fontSize: 14 }}>
              {[c.category, c.city].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <StatusSelect company={c} />
              <Stars company={c} />
            </div>
          </div>
        </div>
        {c.events && <div className="label" style={{ marginBottom: 8 }}>● Cunoscut la {c.events.name}</div>}
        <div className="rigla" style={{ margin: '0 -16px 14px' }} />

        <div className="quick">
          <a href={phone ? telUrl(phone) : undefined} className={phone ? '' : 'disabled'}>
            <Icon name="phone" /> Sună
          </a>
          <a href={phone ? whatsappUrl(phone) : undefined} target="_blank" rel="noreferrer" className={phone ? '' : 'disabled'}>
            <Icon name="whatsapp" /> WhatsApp
          </a>
          <button onClick={email_}>
            <Icon name="mail" /> Email AI
          </button>
          <button onClick={() => setCalendar({ title: `Follow-up ${c.name}`, location: c.address ?? c.city ?? undefined })}>
            <Icon name="calendar" /> Calendar
          </button>
          <button onClick={() => saveContact(c.people[0] ?? null, c)}>
            <Icon name="contact" /> Agendă
          </button>
          <a href={mapsUrl(mapQuery)} target="_blank" rel="noreferrer">
            <Icon name="map" /> Hartă
          </a>
          <a href={c.website ? webUrl(c.website) : undefined} target="_blank" rel="noreferrer" className={c.website ? '' : 'disabled'}>
            <Icon name="globe" /> Site
          </a>
          <button onClick={share}>
            <Icon name="share" /> Trimite
          </button>
        </div>

        <SocialLinks c={c} />
        {busy && <Working label={busy} />}

        {/* AI */}
        <div className="section-title">
          <h2>Pe scurt</h2>
          <button className="btn-l sm" onClick={research} disabled={!!busy}>
            <Icon name="sparkle" size={16} /> Cercetează cu AI
          </button>
        </div>
        <div className="card">
          {c.ai_summary ? <div className="summary">{c.ai_summary}</div> : <div className="mute">Încă nu există un rezumat. AI-ul caută firma pe web, în registrul oficial (ANAF / datero.md) și pe site-ul ei.</div>}
          {c.enriched_at && <div className="label" style={{ marginTop: 6 }}>actualizat {fmtDateTime(c.enriched_at)}</div>}
          <dl className="kv" style={{ marginTop: 12 }}>
            {c.phone && (<><dt>Telefon</dt><dd><a href={telUrl(c.phone)}>{c.phone}</a></dd></>)}
            {c.email && (<><dt>Email</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></>)}
            {c.website && (<><dt>Website</dt><dd><a href={webUrl(c.website)} target="_blank" rel="noreferrer">{c.website}</a></dd></>)}
            {c.address && (<><dt>Adresă</dt><dd>{c.address}</dd></>)}
            {c.products.length > 0 && (<><dt>Produse</dt><dd>{c.products.join(', ')}</dd></>)}
            {c.tags.length > 0 && (
              <>
                <dt>Etichete</dt>
                <dd className="row wrap" style={{ gap: 4 }}>
                  {c.tags.map((t) => (
                    <span key={t} className="chip">#{t}</span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>

        <RegistryCard c={c} />
        <FinancialsCard c={c} />
        <People company={c} onEdit={setPerson} />
        <Tasks company={c} onCalendar={setCalendar} />
        <Notes company={c} />

        <div className="divider" />
        <button
          className="btn-l danger sm"
          onClick={async () => {
            if (!confirm(`Ștergi definitiv „${c.name}” cu toate persoanele, notițele și sarcinile?`)) return
            try {
              await deleteCompany(c.id)
              invalidate()
              toast('Firmă ștearsă')
              nav('/', { replace: true })
            } catch (e) {
              toast(errText(e), true)
            }
          }}
        >
          <Icon name="trash" size={16} /> Șterge firma
        </button>
      </main>

      {calendar && <CalendarSheet initial={calendar} onClose={() => setCalendar(null)} />}
      {editing && <EditCompany company={c} onClose={() => setEditing(false)} />}
      {person && <EditPerson company={c} person={person} onClose={() => setPerson(null)} />}
    </>
  )
}

// ───────────── Status & rating ─────────────
function StatusSelect({ company }: { company: Company }) {
  const upd = useUpdateCompany(company.id)
  return (
    <select
      className={`chip status status-${company.status}`}
      style={{ appearance: 'none', cursor: 'pointer', paddingRight: 8 }}
      value={company.status}
      onChange={(e) => upd.mutate({ status: e.target.value as Company['status'] })}
      aria-label="Status"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}

function Stars({ company }: { company: Company }) {
  const upd = useUpdateCompany(company.id)
  return (
    <div className="stars row" style={{ gap: 0 }} aria-label="Potențial">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={(company.rating ?? 0) >= n ? 'on' : ''}
          onClick={() => upd.mutate({ rating: company.rating === n ? null : n })}
          aria-label={`${n} stele`}
        >
          <Icon name="star" size={16} fill={(company.rating ?? 0) >= n} stroke={1.5} />
        </button>
      ))}
    </div>
  )
}

// ───────────── Persoane ─────────────
function People({ company, onEdit }: { company: CompanyFull; onEdit: (p: Partial<Person>) => void }) {
  return (
    <>
      <div className="section-title">
        <h2>Persoane</h2>
        <button className="btn-l sm" onClick={() => onEdit({})}>
          <Icon name="plus" size={16} /> Adaugă
        </button>
      </div>
      <div className="card" style={{ paddingBlock: 4 }}>
        {company.people.length === 0 && <div className="mute" style={{ padding: '10px 0' }}>Nicio persoană de contact.</div>}
        {company.people.map((p) => (
          <div key={p.id} className="person">
            <div className="avatar">{p.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
            <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => onEdit(p)}>
              <div style={{ fontWeight: 600 }}>{p.full_name}</div>
              <div className="mute" style={{ fontSize: 13 }}>{[p.role, p.phone].filter(Boolean).join(' · ') || 'fără detalii'}</div>
            </button>
            {p.phone && (
              <a className="icon-btn" href={telUrl(p.phone)} aria-label={`Sună ${p.full_name}`}>
                <Icon name="phone" size={19} />
              </a>
            )}
            {p.phone && (
              <a className="icon-btn" href={whatsappUrl(p.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <Icon name="whatsapp" size={19} />
              </a>
            )}
            {p.email && (
              <a className="icon-btn" href={`mailto:${p.email}`} aria-label="Email">
                <Icon name="mail" size={19} />
              </a>
            )}
            <button className="icon-btn" onClick={() => saveContact(p, company)} aria-label="Salvează în agendă">
              <Icon name="contact" size={19} />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

function EditPerson({ company, person, onClose }: { company: CompanyFull; person: Partial<Person>; onClose: () => void }) {
  const [p, setP] = useState(person)
  const { upsertPerson, deletePerson } = useRowMutations(company.id)
  const toast = useToast()
  const f = (k: keyof Person) => ({
    value: (p[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value || null }),
  })
  return (
    <Sheet title={person.id ? 'Editează persoana' : 'Persoană nouă'} onClose={onClose}>
      <div className="stack">
        <input className="input" placeholder="Nume și prenume" autoFocus {...f('full_name')} />
        <input className="input" placeholder="Funcție" {...f('role')} />
        <input className="input" type="tel" placeholder="Telefon" {...f('phone')} />
        <input className="input" type="email" placeholder="Email" {...f('email')} />
        <input className="input" placeholder="LinkedIn" {...f('linkedin')} />
        <button
          className="btn block"
          disabled={!p.full_name?.trim()}
          onClick={() =>
            upsertPerson.mutate(p, {
              onSuccess: onClose,
              onError: (e) => toast(errText(e), true),
            })
          }
        >
          Salvează
        </button>
        {person.id && (
          <button className="btn-l danger" onClick={() => deletePerson.mutate(person.id!, { onSuccess: onClose })}>
            Șterge persoana
          </button>
        )}
      </div>
    </Sheet>
  )
}

// ───────────── Sarcini ─────────────
function Tasks({ company, onCalendar }: { company: CompanyFull; onCalendar: (e: Partial<CalEvent> & { title: string }) => void }) {
  const { upsertTask, deleteTask } = useRowMutations(company.id)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const add = () => {
    if (!title.trim()) return
    upsertTask.mutate({ title: title.trim(), due_at: fromLocalInput(due) })
    setTitle('')
    setDue('')
  }
  return (
    <>
      <div className="section-title">
        <h2>Checklist</h2>
        <span className="label">
          {company.tasks.filter((t) => t.done).length}/{company.tasks.length}
        </span>
      </div>
      <div className="card">
        {company.tasks.map((t) => {
          const d = fmtDue(t.due_at)
          return (
            <div key={t.id} className={`task ${t.done ? 'done' : ''}`}>
              <input type="checkbox" checked={t.done} onChange={() => upsertTask.mutate({ id: t.id, title: t.title, done: !t.done })} aria-label={t.title} />
              <div className="grow">
                <div className={`title ${t.done ? 'taiat' : ''}`}>{t.title}</div>
                {d && <div className={`due ${d.late && !t.done ? 'late' : ''}`}>{d.text}</div>}
              </div>
              <button
                className="icon-btn"
                aria-label="Adaugă în calendar"
                onClick={() => onCalendar({ title: `${t.title} — ${company.name}`, start: t.due_at ? new Date(t.due_at) : undefined })}
              >
                <Icon name="calendar" size={18} />
              </button>
              <button className="icon-btn" aria-label="Șterge" onClick={() => deleteTask.mutate(t.id)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          )
        })}
        <div className="stack" style={{ gap: 6, marginTop: company.tasks.length ? 8 : 0 }}>
          <div className="row">
            <input className="input grow" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Sarcină nouă…" />
            <button className="btn sm" style={{ minHeight: 44 }} onClick={add} aria-label="Adaugă sarcina">
              <Icon name="plus" />
            </button>
          </div>
          {title && <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
        </div>
      </div>
    </>
  )
}

// ───────────── Notițe ─────────────
function Notes({ company }: { company: CompanyFull }) {
  const { addNote, deleteNote } = useRowMutations(company.id)
  const [text, setText] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const rec = useRecorder()
  const toast = useToast()

  async function dictate() {
    if (!rec.recording) {
      try {
        await rec.start()
      } catch {
        toast('Nu am acces la microfon', true)
      }
      return
    }
    const blob = await rec.stop()
    setTranscribing(true)
    try {
      const t = await transcribeAudio(blob)
      addNote.mutate({ body: t, source: 'voce' })
    } catch (e) {
      toast(errText(e), true)
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <>
      <div className="section-title">
        <h2>Notițe</h2>
        <span className="label">{company.notes.length}</span>
      </div>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <textarea className="textarea grow" rows={2} style={{ minHeight: 48 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Notiță nouă…" />
          {text.trim() ? (
            <button
              className="btn sm"
              style={{ minHeight: 48 }}
              onClick={() => {
                addNote.mutate({ body: text.trim() })
                setText('')
              }}
              aria-label="Salvează notița"
            >
              <Icon name="send" />
            </button>
          ) : (
            <button className={`btn sm ${rec.recording ? 'ink' : ''}`} style={{ minHeight: 48 }} onClick={dictate} disabled={transcribing} aria-label="Dictează notița">
              {rec.recording ? fmtSeconds(rec.seconds) : <Icon name="mic" />}
            </button>
          )}
        </div>
        {transcribing && <Working label="Transcriu…" />}
        {company.notes.length === 0 && !transcribing && <div style={{ marginTop: 10 }}><Empty hand="pagină goală">Nicio notiță încă.</Empty></div>}
        <div style={{ marginTop: 6 }}>
          {company.notes.map((n) => (
            <div key={n.id} className="note">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">
                  {fmtDateTime(n.created_at)} · {SOURCE_LABEL[n.source]}
                </span>
                <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Șterge notița" onClick={() => confirm('Ștergi notița?') && deleteNote.mutate(n.id)}>
                  <Icon name="close" size={15} />
                </button>
              </div>
              <div style={{ marginTop: 4 }}>{n.body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ───────────── Editare firmă ─────────────
function EditCompany({ company, onClose }: { company: Company; onClose: () => void }) {
  const [c, setC] = useState(company)
  const upd = useUpdateCompany(company.id)
  const toast = useToast()
  const txt = (k: keyof Company) => ({
    value: (c[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value || null }),
  })
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  return (
    <Sheet title="Editează firma" onClose={onClose}>
      <div className="stack">
        <div className="field"><label className="label">Nume</label><input className="input" {...txt('name')} /></div>
        <div className="grid2">
          <div className="field"><label className="label">Categorie</label><input className="input" {...txt('category')} /></div>
          <div className="field"><label className="label">Oraș</label><input className="input" {...txt('city')} /></div>
        </div>
        <div className="field"><label className="label">Adresă</label><input className="input" {...txt('address')} /></div>
        <div className="grid2">
          <div className="field"><label className="label">Telefon</label><input className="input" type="tel" {...txt('phone')} /></div>
          <div className="field"><label className="label">Email</label><input className="input" type="email" {...txt('email')} /></div>
        </div>
        <div className="field"><label className="label">Website</label><input className="input" {...txt('website')} /></div>
        <div className="field">
          <label className="label">CUI (România) / IDNO (Moldova)</label>
          <input className="input mono" inputMode="numeric" placeholder="ex: 14399840 sau 1007600041186" {...txt('registry_id')} />
        </div>
        <div className="field"><label className="label">Logo (URL imagine)</label><input className="input" {...txt('logo_url')} /></div>
        <div className="field">
          <label className="label">Produse (virgulă)</label>
          <input className="input" value={c.products.join(', ')} onChange={(e) => setC({ ...c, products: list(e.target.value) })} />
        </div>
        <div className="field">
          <label className="label">Etichete (virgulă)</label>
          <input className="input" value={c.tags.join(', ')} onChange={(e) => setC({ ...c, tags: list(e.target.value) })} />
        </div>
        <div className="field"><label className="label">Rezumat</label><textarea className="textarea" {...txt('ai_summary')} /></div>
        <button
          className="btn block"
          disabled={!c.name?.trim()}
          onClick={() =>
            upd.mutate(
              {
                name: c.name, category: c.category, city: c.city, address: c.address, phone: c.phone, email: c.email,
                website: c.website, logo_url: c.logo_url, registry_id: c.registry_id?.replace(/\D/g, '') || null, products: c.products, tags: c.tags, ai_summary: c.ai_summary,
              },
              { onSuccess: onClose, onError: (e) => toast(errText(e), true) },
            )
          }
        >
          Salvează
        </button>
      </div>
    </Sheet>
  )
}

