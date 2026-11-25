import { useState } from 'react'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/Layout'
import { Empty, errText, fmtDate, Sheet, useToast } from '../components/ui'
import { useEventMutations, useEvents } from '../lib/api'
import { setCurrentEvent, useCurrentEvent } from '../lib/currentEvent'
import { download } from '../lib/shortcuts'
import { exportAll, exportFilename } from '../lib/export'
import type { EventRow } from '../lib/types'

export function Evenimente() {
  const { data, isLoading } = useEvents()
  const cur = useCurrentEvent()
  const [edit, setEdit] = useState<Partial<EventRow> | null>(null)
  const toast = useToast()

  return (
    <>
      <TopBar title="Târguri & întâlniri" />
      <main className="page">
        <p className="mute" style={{ marginTop: 0 }}>
          Alege evenimentul la care ești acum: toate conexiunile noi se leagă automat de el.
        </p>
        <button className="btn block" onClick={() => setEdit({})}>
          <Icon name="plus" /> Eveniment nou
        </button>

        <div className="stack" style={{ marginTop: 16 }}>
          {isLoading && <div className="skeleton" style={{ height: 90 }} />}
          {data?.length === 0 && <Empty hand="niciun târg încă">Adaugă primul eveniment, ex: „BIFE-SIM 2026”.</Empty>}
          {data?.map((e) => {
            const active = cur?.id === e.id
            const n = e.companies[0]?.count ?? 0
            return (
              <div key={e.id} className={`card ${active ? 'ink' : ''}`}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <h3>{e.name}</h3>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {[e.city, e.venue].filter(Boolean).join(' · ')}
                      {e.starts_on && ` · ${fmtDate(e.starts_on)}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${fmtDate(e.ends_on)}` : ''}`}
                    </div>
                    <div className="label" style={{ marginTop: 4, color: active ? 'var(--or-soft)' : undefined }}>
                      {n} {n === 1 ? 'conexiune' : 'conexiuni'}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setEdit(e)} aria-label="Editează">
                    <Icon name="edit" size={18} />
                  </button>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className={active ? 'btn sm' : 'btn-l sm'}
                    onClick={() => setCurrentEvent(active ? null : { id: e.id, name: e.name })}
                  >
                    {active ? '● Eveniment curent' : 'Sunt aici acum'}
                  </button>
                  {n > 0 && (
                    <button
                      className="btn-l sm"
                      style={active ? { color: 'var(--paper)', borderColor: 'var(--paper)' } : undefined}
                      onClick={async () => {
                        try {
                          download(exportFilename(e.name.toLowerCase().replace(/\W+/g, '-')), JSON.stringify(await exportAll({ eventId: e.id }), null, 2), 'application/json')
                        } catch (err) {
                          toast(errText(err), true)
                        }
                      }}
                    >
                      <Icon name="download" size={16} /> JSON
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>
      {edit && <EditEvent ev={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function EditEvent({ ev, onClose }: { ev: Partial<EventRow>; onClose: () => void }) {
  const [e, setE] = useState(ev)
  const { upsert, remove } = useEventMutations()
  const cur = useCurrentEvent()
  const toast = useToast()
  const f = (k: keyof EventRow) => ({
    value: (e[k] as string) ?? '',
    onChange: (x: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setE({ ...e, [k]: x.target.value || null }),
  })
  return (
    <Sheet title={ev.id ? 'Editează evenimentul' : 'Eveniment nou'} onClose={onClose}>
      <div className="stack">
        <div className="field"><label className="label">Nume</label><input className="input" autoFocus placeholder="ex: BIFE-SIM 2026" {...f('name')} /></div>
        <div className="grid2">
          <div className="field"><label className="label">Oraș</label><input className="input" {...f('city')} /></div>
          <div className="field"><label className="label">Locație</label><input className="input" placeholder="Romexpo" {...f('venue')} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label className="label">De la</label><input className="input" type="date" {...f('starts_on')} /></div>
          <div className="field"><label className="label">Până la</label><input className="input" type="date" {...f('ends_on')} /></div>
        </div>
        <div className="field"><label className="label">Notițe</label><textarea className="textarea" rows={3} {...f('notes')} /></div>
        <button
          className="btn block"
          disabled={!e.name?.trim()}
          onClick={() =>
            upsert.mutate(
              { id: e.id, name: e.name, city: e.city, venue: e.venue, starts_on: e.starts_on, ends_on: e.ends_on, notes: e.notes },
              {
                onSuccess: (saved) => {
                  if (!ev.id) setCurrentEvent({ id: saved.id, name: saved.name })
                  else if (cur?.id === saved.id) setCurrentEvent({ id: saved.id, name: saved.name })
                  onClose()
                },
                onError: (x) => toast(errText(x), true),
              },
            )
          }
        >
          {ev.id ? 'Salvează' : 'Creează și setează ca eveniment curent'}
        </button>
        {ev.id && (
          <button
            className="btn-l danger"
            onClick={() =>
              confirm('Ștergi evenimentul? Conexiunile rămân, doar se dezleagă de el.') &&
              remove.mutate(ev.id!, {
                onSuccess: () => {
                  if (cur?.id === ev.id) setCurrentEvent(null)
                  onClose()
                },
              })
            }
          >
            Șterge evenimentul
          </button>
        )}
      </div>
    </Sheet>
  )
}
