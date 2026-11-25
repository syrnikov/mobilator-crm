import { useState } from 'react'
import { addToCalendar, googleCalendarUrl, type CalEvent } from '../lib/shortcuts'
import { Icon } from './Icon'
import { Sheet, toLocalInput } from './ui'

/** Creează un eveniment în calendarul telefonului (.ics) sau Google Calendar. */
export function CalendarSheet({ initial, onClose }: { initial: Partial<CalEvent> & { title: string }; onClose: () => void }) {
  const tomorrow10 = new Date()
  tomorrow10.setDate(tomorrow10.getDate() + 1)
  tomorrow10.setHours(10, 0, 0, 0)

  const [title, setTitle] = useState(initial.title)
  const [start, setStart] = useState(toLocalInput((initial.start ?? tomorrow10).toISOString()))
  const [minutes, setMinutes] = useState(
    initial.end && initial.start ? Math.max(15, Math.round((initial.end.getTime() - initial.start.getTime()) / 60000)) : 30,
  )
  const [location, setLocation] = useState(initial.location ?? '')
  const [description, setDescription] = useState(initial.description ?? '')

  const ev = (): CalEvent => {
    const s = new Date(start)
    return { title, start: s, end: new Date(s.getTime() + minutes * 60000), location, description }
  }

  return (
    <Sheet title="Adaugă în calendar" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label className="label">Titlu</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label className="label">Început</label>
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Durată</label>
            <select className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120, 240].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label">Locație</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Detalii</label>
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button
          className="btn block"
          disabled={!title || !start}
          onClick={async () => {
            await addToCalendar(ev())
            onClose()
          }}
        >
          <Icon name="calendar" /> Adaugă în calendarul telefonului
        </button>
        <a className="btn-l" href={start ? googleCalendarUrl(ev()) : undefined} target="_blank" rel="noreferrer" onClick={onClose}>
          Deschide în Google Calendar
        </a>
      </div>
    </Sheet>
  )
}
