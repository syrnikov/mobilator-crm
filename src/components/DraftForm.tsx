import { useEffect, useRef, useState } from 'react'
import { matchCompanies, type CompanyMatch } from '../lib/api'
import { STATUS_LABEL, STATUSES, type Draft } from '../lib/types'
import { Icon } from './Icon'
import { fromLocalInput, toLocalInput } from './ui'

type Props = {
  draft: Draft
  onChange: (d: Draft) => void
  /** firma existentă la care se adaugă (dacă e aleasă) */
  intoCompany: { id: string; name: string } | null
  onIntoCompany: (c: { id: string; name: string } | null) => void
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Previzualizare editabilă a fișei extrase de AI (sau completare manuală). */
export function DraftForm({ draft, onChange, intoCompany, onIntoCompany }: Props) {
  const [matches, setMatches] = useState<CompanyMatch[]>([])
  const autoPicked = useRef(false)
  const c = draft.company
  const setC = (patch: Partial<Draft['company']>) => onChange({ ...draft, company: { ...c, ...patch } })
  const socials = draft.socials ?? { facebook: null, instagram: null, tiktok: null }
  const setS = (patch: Partial<typeof socials>) => onChange({ ...draft, socials: { ...socials, ...patch } })

  // caută firma în CRM după cod fiscal / telefon / email / nume
  const key = JSON.stringify([c.name, c.phone, c.email, draft.registry_id, draft.people.map((p) => [p.phone, p.email])])
  useEffect(() => {
    const t = setTimeout(
      () =>
        matchCompanies(draft)
          .then((m) => {
            setMatches(m)
            // potrivire sigură (telefon / email / cod fiscal) → propunem direct firma existentă
            if (!autoPicked.current && m[0] && m[0].score >= 90) {
              autoPicked.current = true
              onIntoCompany({ id: m[0].id, name: m[0].name })
            }
          })
          .catch(() => setMatches([])),
      400,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div className="stack">
      {matches.length > 0 && (
        <div className="banner">
          <div className="label" style={{ color: 'var(--or-dk)', marginBottom: 6 }}>
            {matches[0].score >= 90 ? 'Firma există deja în CRM' : 'Poate există deja în CRM'}
          </div>
          <div className="row wrap">
            {matches.map((m) => (
              <button
                key={m.id}
                className={`chip ${intoCompany?.id === m.id ? 'ink' : 'or'}`}
                onClick={() => onIntoCompany(intoCompany?.id === m.id ? null : { id: m.id, name: m.name })}
              >
                {intoCompany?.id === m.id && <Icon name="check" size={13} />}
                {m.name}
                {m.city ? ` · ${m.city}` : ''} <span style={{ opacity: 0.7 }}>({m.reason})</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {intoCompany
              ? `Se adaugă la „${intoCompany.name}”: persoane noi, notiță, sarcini și întâlnirea de azi. Atinge din nou ca să creezi o firmă nouă.`
              : 'Atinge o firmă ca să adaugi informațiile la ea, în loc să creezi una nouă.'}
          </div>
        </div>
      )}

      {!intoCompany && (
        <>
          <div className="field">
            <label className="label">Firmă</label>
            <input className="input" value={c.name} onChange={(e) => setC({ name: e.target.value })} placeholder="Numele firmei" />
          </div>
          <div className="grid2">
            <div className="field">
              <label className="label">Categorie</label>
              <input className="input" value={c.category ?? ''} onChange={(e) => setC({ category: e.target.value })} placeholder="ex: furnizor PAL" />
            </div>
            <div className="field">
              <label className="label">Oraș</label>
              <input className="input" value={c.city ?? ''} onChange={(e) => setC({ city: e.target.value })} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label className="label">Telefon firmă</label>
              <input className="input" type="tel" value={c.phone ?? ''} onChange={(e) => setC({ phone: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Email firmă</label>
              <input className="input" type="email" value={c.email ?? ''} onChange={(e) => setC({ email: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label">Website</label>
            <input className="input" inputMode="url" value={c.website ?? ''} onChange={(e) => setC({ website: e.target.value })} placeholder="firma.ro" />
          </div>
          <div className="grid2">
            <div className="field">
              <label className="label">Instagram</label>
              <input className="input" value={socials.instagram ?? ''} onChange={(e) => setS({ instagram: e.target.value || null })} placeholder="@brand" />
            </div>
            <div className="field">
              <label className="label">Facebook</label>
              <input className="input" value={socials.facebook ?? ''} onChange={(e) => setS({ facebook: e.target.value || null })} placeholder="pagina" />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label className="label">TikTok</label>
              <input className="input" value={socials.tiktok ?? ''} onChange={(e) => setS({ tiktok: e.target.value || null })} placeholder="@brand" />
            </div>
            <div className="field">
              <label className="label">CUI / IDNO</label>
              <input className="input mono" inputMode="numeric" value={draft.registry_id ?? ''} onChange={(e) => onChange({ ...draft, registry_id: e.target.value || null })} />
            </div>
          </div>
          <div className="field">
            <label className="label">Produse / servicii (separate prin virgulă)</label>
            <input className="input" value={c.products.join(', ')} onChange={(e) => setC({ products: list(e.target.value) })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label className="label">Status</label>
              <select className="select" value={draft.status} onChange={(e) => onChange({ ...draft, status: e.target.value as Draft['status'] })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Etichete</label>
              <input className="input" value={draft.tags.join(', ')} onChange={(e) => onChange({ ...draft, tags: list(e.target.value) })} />
            </div>
          </div>
        </>
      )}

      <div className="section-title" style={{ margin: '10px 0 0' }}>
        <h3>Persoane</h3>
        <button
          className="btn-l sm"
          onClick={() => onChange({ ...draft, people: [...draft.people, { full_name: '', role: null, phone: null, email: null }] })}
        >
          <Icon name="plus" size={16} /> Persoană
        </button>
      </div>
      {draft.people.map((p, i) => {
        const setP = (patch: Partial<typeof p>) =>
          onChange({ ...draft, people: draft.people.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
        return (
          <div key={i} className="card stack" style={{ padding: 10, gap: 8 }}>
            <div className="row">
              <input className="input grow" value={p.full_name} onChange={(e) => setP({ full_name: e.target.value })} placeholder="Nume și prenume" />
              <button className="icon-btn" aria-label="Șterge persoana" onClick={() => onChange({ ...draft, people: draft.people.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <input className="input" value={p.role ?? ''} onChange={(e) => setP({ role: e.target.value })} placeholder="Funcție" />
            <div className="grid2">
              <input className="input" type="tel" value={p.phone ?? ''} onChange={(e) => setP({ phone: e.target.value })} placeholder="Telefon" />
              <input className="input" type="email" value={p.email ?? ''} onChange={(e) => setP({ email: e.target.value })} placeholder="Email" />
            </div>
          </div>
        )
      })}

      <div className="field" style={{ marginTop: 6 }}>
        <label className="label">Notiță</label>
        <textarea className="textarea" rows={5} value={draft.note} onChange={(e) => onChange({ ...draft, note: e.target.value })} />
      </div>

      <div className="section-title" style={{ margin: '10px 0 0' }}>
        <h3>Sarcini</h3>
        <button className="btn-l sm" onClick={() => onChange({ ...draft, tasks: [...draft.tasks, { title: '', due_at: null }] })}>
          <Icon name="plus" size={16} /> Sarcină
        </button>
      </div>
      {draft.tasks.map((t, i) => {
        const setT = (patch: Partial<typeof t>) =>
          onChange({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
        return (
          <div key={i} className="card stack" style={{ padding: 10, gap: 8 }}>
            <div className="row">
              <input className="input grow" value={t.title} onChange={(e) => setT({ title: e.target.value })} placeholder="Ce trebuie făcut" />
              <button className="icon-btn" aria-label="Șterge sarcina" onClick={() => onChange({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <input className="input" type="datetime-local" value={toLocalInput(t.due_at)} onChange={(e) => setT({ due_at: fromLocalInput(e.target.value) })} />
          </div>
        )
      })}
    </div>
  )
}
