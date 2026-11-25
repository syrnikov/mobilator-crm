import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useCurrentEvent } from '../lib/currentEvent'
import { useQueueCount } from '../lib/offlineQueue'
import { CaptureSheet } from './CaptureSheet'
import { Icon } from './Icon'

export function Layout() {
  const [capture, setCapture] = useState(false)
  return (
    <div className="app">
      <Outlet context={{ openCapture: () => setCapture(true) }} />
      <nav className="bottomnav" aria-label="Navigare">
        <NavLink to="/" end>
          <Icon name="list" />
          Conexiuni
        </NavLink>
        <NavLink to="/evenimente">
          <Icon name="flag" />
          Târguri
        </NavLink>
        <button className="fab" onClick={() => setCapture(true)} aria-label="Conexiune nouă">
          <Icon name="mic" size={30} stroke={2.2} />
        </button>
        <NavLink to="/asistent">
          <Icon name="sparkle" />
          Asistent
        </NavLink>
        <NavLink to="/setari">
          <Icon name="settings" />
          Setări
        </NavLink>
      </nav>
      {capture && <CaptureSheet onClose={() => setCapture(false)} />}
    </div>
  )
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const ev = useCurrentEvent()
  const queued = useQueueCount()
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn back" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="Înapoi">
          <Icon name="back" />
        </button>
      )}
      {title ? <h2 className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2> : <img src={`${import.meta.env.BASE_URL}logo_light.png`} className="logo" alt="Mobilator" />}
      {!title && <div className="spacer" />}
      {queued > 0 && (
        <span className="chip or" title="Capturi în așteptare (offline)">
          <Icon name="cloudoff" size={14} /> {queued}
        </span>
      )}
      {right ??
        (ev && !back && (
          <button className="chip event-chip" onClick={() => nav('/evenimente')}>
            ● {ev.name}
          </button>
        ))}
    </header>
  )
}
