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
          {years.length > 0 && <FinanceTable years={years} />}
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

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }
const SOCIAL_ORDER = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube']

/** Mărci simplificate (glif alb), colorate prin fundalul butonului. */
const GLYPH: Record<string, React.ReactNode> = {
  instagram: (
    <g fill="none" stroke="#fff" strokeWidth="2">
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.3" />
      <circle cx="16.4" cy="7.6" r="0.6" fill="#fff" stroke="none" />
    </g>
  ),
  facebook: <path fill="#fff" d="M13.3 20v-6.4h2.2l.3-2.6h-2.5V9.4c0-.7.2-1.3 1.3-1.3h1.3V5.8a17 17 0 0 0-2-.1c-2 0-3.3 1.2-3.3 3.4V11H8.4v2.6h2.2V20z" />,
  tiktok: (
    <path
      fill="#fff"
      d="M15.6 4h-2.7v10.3a2.3 2.3 0 1 1-1.7-2.2V9.4a5 5 0 1 0 4.4 4.9V9.1a6.3 6.3 0 0 0 3.6 1.1V7.5a3.7 3.7 0 0 1-3.6-3.5z"
    />
  ),
  linkedin: (
    <path fill="#fff" d="M6.4 9.6h2.7V18H6.4zM7.8 5.6a1.5 1.5 0 1 1 0 3.1 1.5 1.5 0 0 1 0-3.1zM10.8 9.6h2.6v1.2c.4-.7 1.3-1.4 2.6-1.4 2.8 0 3.3 1.8 3.3 4.2V18h-2.7v-3.9c0-.9 0-2.1-1.3-2.1s-1.5 1-1.5 2V18h-2.7z" />
  ),
  youtube: <path fill="#fff" d="M10 8.8v6.4l5.6-3.2z" />,
}

function BarButton({ href, label, kind, children }: { href: string; label: string; kind: string; children: React.ReactNode }) {
  return (
    <a className={`lb lb-${kind}`} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        {children}
      </svg>
    </a>
  )
}

/** Bara de sus: site, hartă și rețelele brandului ca iconițe colorate. Fără rețele → buton de căutare. */
export function LinkBar({ c, mapUrl, onFind, busy }: { c: Company; mapUrl: string; onFind: () => void; busy: boolean }) {
  const socials = Object.entries(c.socials ?? {})
    .filter(([k, v]) => v && GLYPH[k])
    .sort(([a], [b]) => SOCIAL_ORDER.indexOf(a) - SOCIAL_ORDER.indexOf(b))
  return (
    <div className="linkbar">
      {c.website && (
        <BarButton href={c.website.startsWith('http') ? c.website : `https://${c.website}`} label="Site" kind="web">
          <g fill="none" stroke="#fff" strokeWidth="1.8">
            <circle cx="12" cy="12" r="7" />
            <path d="M5 12h14M12 5c2.3 2.5 2.3 11.5 0 14M12 5c-2.3 2.5-2.3 11.5 0 14" />
          </g>
        </BarButton>
      )}
      <BarButton href={mapUrl} label="Hartă" kind="map">
        <path fill="#fff" d="M12 4a5.5 5.5 0 0 0-5.5 5.5c0 4.2 5.5 10.5 5.5 10.5s5.5-6.3 5.5-10.5A5.5 5.5 0 0 0 12 4zm0 7.6a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2z" />
      </BarButton>
      {socials.length > 0 && <span className="lb-sep" />}
      {socials.map(([k, v]) => (
        <BarButton key={k} href={v as string} label={SOCIAL_LABEL[k]} kind={k}>
          {GLYPH[k]}
        </BarButton>
      ))}
      {socials.length === 0 && (
        <button className="btn-l sm lb-find" onClick={onFind} disabled={busy}>
          <Icon name="search" size={16} /> {busy ? 'Caut…' : 'Caută rețelele sociale'}
        </button>
      )}
    </div>
  )
}

// ───────────── Tabel financiar (ca pe listafirme) ─────────────
const COLS: { key: keyof FinancialYear; label: string }[] = [
  { key: 'revenue', label: 'Cifra de afaceri' },
  { key: 'net_profit', label: 'Profit net' },
  { key: 'debts', label: 'Datorii totale' },
  { key: 'fixed_assets', label: 'Active imobilizate' },
  { key: 'current_assets', label: 'Active circulante' },
  { key: 'equity', label: 'Capitaluri proprii' },
  { key: 'employees', label: 'Nr. salariați' },
]
const full = (n: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(n).replace(/\./g, ' ')

function FinanceTable({ years }: { years: FinancialYear[] }) {
  const rows = [...years].sort((a, b) => b.year - a.year)
  const cols = COLS.filter((col) => rows.some((r) => r[col.key] != null))
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>An</th>
              {cols.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td className="yr">{r.year}</td>
                {cols.map((col) => {
                  const v = r[col.key] as number | null | undefined
                  return (
                    <td key={col.key} className={v != null && v < 0 ? 'neg' : ''}>
                      {v == null ? '—' : full(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="label" style={{ padding: '6px 12px 10px' }}>valori în {rows[0].currency} · glisează lateral pentru toate coloanele</div>
    </div>
  )
}
