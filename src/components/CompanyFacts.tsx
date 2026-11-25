import type { Company, FinancialYear } from '../lib/types'
import { Icon } from './Icon'
import { fmtDate, useToast } from './ui'

const compact = (n: number) => new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/**
 * Profilul firmei (jos pe fișă): cifre cheie, grafic cifră de afaceri / profit pe ani,
 * date oficiale de registru. Dacă nu există date, invită la „Cercetează cu AI”.
 */
export function CompanyProfile({ c, onResearch, busy }: { c: Company; onResearch: () => void; busy: boolean }) {
  const years = (c.financials ?? []).filter((f) => f.revenue !== null || f.net_profit !== null)
  const hasRegistry = !!(c.registry_id || c.legal_name || c.founded_on)

  return (
    <>
      <div className="section-title">
        <h2>Profil firmă</h2>
        {c.registry_status && <StatusBadge status={c.registry_status} />}
      </div>

      {!hasRegistry && years.length === 0 ? (
        <div className="card rest" style={{ textAlign: 'center', padding: '22px 16px' }}>
          <div className="hand" style={{ color: 'var(--or-dk)', fontSize: 26 }}>încă fără date oficiale</div>
          <p style={{ margin: '6px 0 14px', fontSize: 15 }}>
            AI-ul caută firma în registrul oficial (ANAF pentru România, datero.md pentru Moldova): an înființare, cifră de afaceri, profit, angajați.
          </p>
          <button className="btn" onClick={onResearch} disabled={busy}>
            <Icon name="sparkle" /> Cercetează cu AI
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <KeyFigures c={c} years={years} />
          {years.length > 0 && <FinanceChart years={years} />}
          <RegistryDetails c={c} />
        </div>
      )}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const active = /activ/i.test(status) && !/inactiv/i.test(status)
  return <span className={`chip ${active ? 'ink' : 'or'}`}>{status}</span>
}

// ───────────── Cifre cheie ─────────────
function KeyFigures({ c, years }: { c: Company; years: FinancialYear[] }) {
  const last = years.at(-1)
  const prev = years.at(-2)
  const cur = last?.currency ?? ''
  const founded = c.founded_on ? new Date(c.founded_on) : null
  const age = founded ? new Date().getFullYear() - founded.getFullYear() : null
  const growth = last?.revenue != null && prev?.revenue ? ((last.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : null
  const employees = c.employees ?? last?.employees ?? null

  return (
    <div className="tiles">
      <div className="tile">
        <div className="label">Înființată</div>
        <div className="tile-val">{founded ? founded.getFullYear() : '—'}</div>
        <div className="tile-sub">{age !== null ? (age < 1 ? 'anul acesta' : `${age} ${age === 1 ? 'an' : 'ani'} pe piață`) : ''}</div>
      </div>
      <div className="tile">
        <div className="label">Cifră afaceri {last?.year ?? ''}</div>
        <div className="tile-val">
          {last?.revenue != null ? compact(last.revenue) : '—'} <small>{last?.revenue != null ? cur : ''}</small>
        </div>
        <div className={`tile-sub ${growth !== null && growth < 0 ? 'neg' : 'pos'}`}>
          {growth !== null && Number.isFinite(growth) ? `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(0)}% vs ${prev!.year}` : ''}
        </div>
      </div>
      <div className="tile">
        <div className="label">Profit net {last?.year ?? ''}</div>
        <div className={`tile-val ${last?.net_profit != null && last.net_profit < 0 ? 'neg' : ''}`}>
          {last?.net_profit != null ? compact(last.net_profit) : '—'} <small>{last?.net_profit != null ? cur : ''}</small>
        </div>
        <div className="tile-sub">
          {last?.net_profit != null && last.revenue ? `marjă ${((last.net_profit / last.revenue) * 100).toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="tile">
        <div className="label">Angajați</div>
        <div className="tile-val">{employees ?? '—'}</div>
        <div className="tile-sub">{sizeLabel(employees)}</div>
      </div>
    </div>
  )
}

const sizeLabel = (n: number | null) =>
  n === null ? '' : n < 10 ? 'microîntreprindere' : n < 50 ? 'firmă mică' : n < 250 ? 'firmă mijlocie' : 'firmă mare'

// ───────────── Grafic: coloane cifră de afaceri + profit net ─────────────
function FinanceChart({ years }: { years: FinancialYear[] }) {
  const cur = years[0].currency
  const W = 340
  const H = 190
  const top = 18
  const bottom = 24
  const left = 4
  const vals = years.flatMap((f) => [f.revenue ?? 0, f.net_profit ?? 0])
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bottom)
  const zero = y(0)
  const slot = (W - left) / years.length
  const bw = Math.min(26, slot * 0.36)

  return (
    <div className="card" style={{ padding: '12px 10px 8px' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
        <span className="label">Evoluție pe ani · {cur}</span>
        <span className="row" style={{ gap: 10, fontSize: 12 }}>
          <span className="row" style={{ gap: 4 }}><i className="key" style={{ background: 'var(--or)' }} /> cifră afaceri</span>
          <span className="row" style={{ gap: 4 }}><i className="key" style={{ background: 'var(--ink)' }} /> profit net</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cifra de afaceri și profitul net pe ani">
        {/* grilă de riglă */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = top + t * (H - top - bottom)
          return <line key={t} x1={0} x2={W} y1={gy} y2={gy} stroke="var(--line)" strokeDasharray="2 4" />
        })}
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="var(--ink)" strokeWidth={1.5} />
        {years.map((f, i) => {
          const cx = left + slot * i + slot / 2
          const r = f.revenue ?? 0
          const p = f.net_profit ?? 0
          return (
            <g key={f.year}>
              <rect x={cx - bw - 1} y={Math.min(y(r), zero)} width={bw} height={Math.max(1.5, Math.abs(zero - y(r)))} fill="var(--or)" />
              <rect x={cx + 1} y={Math.min(y(p), zero)} width={bw} height={Math.max(1.5, Math.abs(zero - y(p)))} fill={p < 0 ? 'var(--or-dk)' : 'var(--ink)'} />
              {f.revenue !== null && (
                <text x={cx - bw / 2 - 1} y={Math.min(y(r), zero) - 4} textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--ink)">
                  {compact(r)}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fontFamily="var(--f-mono)" fill="var(--mute)">
                {f.year}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ───────────── Date oficiale ─────────────
function RegistryDetails({ c }: { c: Company }) {
  const toast = useToast()
  if (!c.registry_id && !c.legal_name) return null
  const idLabel = c.registry_source === 'datero.md' || c.registry_id?.length === 13 ? 'IDNO' : 'CUI'
  return (
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
        {c.address && (<><dt>Sediu</dt><dd>{c.address}</dd></>)}
      </dl>
      {c.registry_url && (
        <a className="label" href={c.registry_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, marginTop: 10, color: 'var(--or-dk)' }}>
          <Icon name="link" size={13} /> Sursa: {c.registry_source === 'ANAF' ? 'ANAF · vezi pe listafirme.ro' : c.registry_source}
        </a>
      )}
    </div>
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
