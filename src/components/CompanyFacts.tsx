import type { Company } from '../lib/types'
import { Icon } from './Icon'
import { fmtDate, useToast } from './ui'

const compact = (n: number) =>
  new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/** Date oficiale de registru: denumire legală, CUI/IDNO, formă, stare, CAEN/CAEM, administratori. */
export function RegistryCard({ c }: { c: Company }) {
  const toast = useToast()
  if (!c.registry_id && !c.legal_name) return null
  const idLabel = c.registry_source === 'datero.md' || c.registry_id?.length === 13 ? 'IDNO' : 'CUI'
  const active = c.registry_status && /activ/i.test(c.registry_status) && !/inactiv/i.test(c.registry_status)
  return (
    <>
      <div className="section-title">
        <h2>Date firmă</h2>
        {c.registry_status && <span className={`chip ${active ? 'ink' : 'or'}`}>{c.registry_status}</span>}
      </div>
      <div className="card">
        <dl className="kv">
          {c.legal_name && (<><dt>Denumire</dt><dd>{c.legal_name}</dd></>)}
          {c.registry_id && (
            <>
              <dt>{idLabel}</dt>
              <dd>
                <button
                  className="mono"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}
                  onClick={() => navigator.clipboard.writeText(c.registry_id!).then(() => toast(`${idLabel} copiat`))}
                >
                  {c.registry_id}
                </button>
                {c.vat_payer && <span className="chip" style={{ marginLeft: 6 }}>plătitor TVA</span>}
              </dd>
            </>
          )}
          {c.legal_form && (<><dt>Formă</dt><dd>{c.legal_form}</dd></>)}
          {c.founded_on && (<><dt>Înființată</dt><dd>{fmtDate(c.founded_on)}</dd></>)}
          {c.activity_name && (<><dt>Activitate</dt><dd>{c.activity_code ? <span className="mono">{c.activity_code} · </span> : null}{c.activity_name}</dd></>)}
          {c.administrators.length > 0 && (<><dt>Administr.</dt><dd>{c.administrators.join(', ')}</dd></>)}
          {c.employees !== null && (<><dt>Angajați</dt><dd>{c.employees}</dd></>)}
        </dl>
        {c.registry_url && (
          <a className="label" href={c.registry_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, marginTop: 10, color: 'var(--or-dk)' }}>
            <Icon name="link" size={13} /> Sursa: {c.registry_source === 'ANAF' ? 'ANAF · vezi pe listafirme.ro' : c.registry_source}
          </a>
        )}
      </div>
    </>
  )
}

/** Cifra de afaceri pe ani (bare) + profit net. */
export function FinancialsCard({ c }: { c: Company }) {
  const years = (c.financials ?? []).filter((f) => f.revenue !== null || f.net_profit !== null)
  if (years.length === 0) return null
  const cur = years[0].currency
  const max = Math.max(...years.map((f) => Math.abs(f.revenue ?? 0)), 1)
  const last = years.at(-1)!
  const prev = years.at(-2)
  const growth = prev?.revenue && last.revenue !== null ? ((last.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : null
  return (
    <>
      <div className="section-title">
        <h2>Financiar</h2>
        <span className="label">{cur}</span>
      </div>
      <div className="card">
        <div className="row" style={{ alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <div>
            <div className="label">Cifră de afaceri {last.year}</div>
            <div style={{ fontFamily: 'var(--f-head)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.03em' }}>
              {last.revenue !== null ? compact(last.revenue) : '—'} <span style={{ fontSize: 14 }}>{cur}</span>
            </div>
          </div>
          {growth !== null && Number.isFinite(growth) && (
            <span className={`chip ${growth >= 0 ? 'ink' : 'or'}`}>
              {growth >= 0 ? '▲' : '▼'} {Math.abs(growth).toFixed(0)}% față de {prev!.year}
            </span>
          )}
        </div>
        <div className="fin">
          {years.map((f) => (
            <div key={f.year} className="fin-row">
              <span className="mono fin-year">{f.year}</span>
              <div className="fin-track">
                <div className="fin-bar" style={{ width: `${Math.max(2, ((f.revenue ?? 0) / max) * 100)}%` }} />
              </div>
              <span className="mono fin-val">{f.revenue !== null ? compact(f.revenue) : '—'}</span>
              <span className={`mono fin-profit ${f.net_profit !== null && f.net_profit < 0 ? 'neg' : ''}`}>
                {f.net_profit !== null ? `${f.net_profit >= 0 ? '+' : ''}${compact(f.net_profit)}` : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="label" style={{ marginTop: 8 }}>
          bară = cifră de afaceri · dreapta = profit net{last.employees ? ` · ${last.employees} angajați în ${last.year}` : ''}
        </div>
      </div>
    </>
  )
}

const SOCIAL_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok' }

export function SocialLinks({ c }: { c: Company }) {
  const entries = Object.entries(c.socials ?? {}).filter(([, v]) => v)
  if (!entries.length) return null
  return (
    <div className="row wrap" style={{ marginTop: 10 }}>
      {entries.map(([k, v]) => (
        <a key={k} className="chip" href={v} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          <Icon name="link" size={12} /> {SOCIAL_LABEL[k] ?? k}
        </a>
      ))}
    </div>
  )
}
