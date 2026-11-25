import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/Layout'
import { CompanyLogo, Empty, fmtDue, StatusChip } from '../components/ui'
import { useCompanies, useEvents, useOpenTasks } from '../lib/api'
import { useCurrentEvent } from '../lib/currentEvent'
import { STATUS_LABEL, STATUSES, type CompanyStatus } from '../lib/types'

export function Conexiuni() {
  const { openCapture } = useOutletContext<{ openCapture: () => void }>()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CompanyStatus | ''>('')
  const cur = useCurrentEvent()
  const [eventId, setEventId] = useState<string>('')
  const { data: events } = useEvents()
  const { data, isLoading, error } = useCompanies({ q, status, eventId })
  const { data: tasks } = useOpenTasks()

  const dueSoon = (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now() + 2 * 86400000).slice(0, 4)

  return (
    <>
      <TopBar />
      <main className="page">
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută firmă, persoană, produs, notiță…" />
        </div>

        <div className="filters" style={{ marginTop: 10 }}>
          {cur && (
            <button className="chip" aria-pressed={eventId === cur.id} onClick={() => setEventId(eventId === cur.id ? '' : cur.id)}>
              ● {cur.name}
            </button>
          )}
          {(events ?? [])
            .filter((e) => e.id !== cur?.id)
            .slice(0, 4)
            .map((e) => (
              <button key={e.id} className="chip" aria-pressed={eventId === e.id} onClick={() => setEventId(eventId === e.id ? '' : e.id)}>
                {e.name}
              </button>
            ))}
          {STATUSES.map((s) => (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {dueSoon.length > 0 && !q && (
          <>
            <div className="section-title">
              <h2>De făcut</h2>
              <span className="label">{tasks?.length} deschise</span>
            </div>
            <div className="card ink stack" style={{ gap: 8 }}>
              {dueSoon.map((t) => {
                const due = fmtDue(t.due_at)
                return (
                  <Link key={t.id} to={`/firma/${t.company_id}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <Icon name="check" size={16} />
                    <span className="grow" style={{ fontSize: 14 }}>
                      {t.title} <span style={{ color: 'var(--or-soft)' }}>· {t.companies?.name}</span>
                    </span>
                    {due && <span className={`due ${due.late ? 'late' : ''}`} style={{ color: due.late ? 'var(--or)' : 'var(--line-2)' }}>{due.text}</span>}
                  </Link>
                )
              })}
            </div>
          </>
        )}

        <div className="section-title">
          <h2>Conexiuni</h2>
          {data && <span className="label">{data.length}</span>}
        </div>

        {error && <div className="banner">{(error as Error).message}</div>}
        {isLoading && (
          <div className="stack">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 74 }} />
            ))}
          </div>
        )}

        {data && data.length === 0 && (
          <Empty hand={q ? 'nimic găsit' : 'încă nimic aici'}>
            {q ? (
              'Încearcă alt cuvânt sau întreabă asistentul.'
            ) : (
              <>
                Apasă pe butonul portocaliu și dictează prima conexiune.
                <div style={{ marginTop: 14 }}>
                  <button className="btn" onClick={openCapture}>
                    <Icon name="mic" /> Conexiune nouă
                  </button>
                </div>
              </>
            )}
          </Empty>
        )}

        <div className="stack" style={{ gap: 8 }}>
          {data?.map((c) => {
            const open = c.tasks.filter((t) => !t.done).length
            const main = c.people[0]
            return (
              <Link key={c.id} to={`/firma/${c.id}`} className="card company-card">
                <CompanyLogo name={c.name} url={c.logo_url} />
                <div className="grow">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                    <span className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <StatusChip status={c.status} />
                  </div>
                  <div className="meta">
                    {[main && `${main.full_name}${main.role ? ` · ${main.role}` : ''}`, c.category, c.city].filter(Boolean).join(' — ') || 'fără detalii'}
                  </div>
                  {open > 0 && (
                    <div className="label" style={{ color: 'var(--or-dk)', marginTop: 2 }}>
                      {open} {open === 1 ? 'sarcină' : 'sarcini'}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </>
  )
}
