import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentEvent } from '../lib/currentEvent'
import { useQueueCount } from '../lib/offlineQueue'
import { CaptureSheet } from './CaptureSheet'
import { Icon } from './Icon'

export function Layout() {
  const [capture, setCapture] = useState(false)
  const screen = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  // fiecare ecran pornește de sus
  // acolade obligatorii: în browserele noi scrollTo() întoarce un Promise, iar React l-ar trata drept funcție de cleanup
  useEffect(() => {
    screen.current?.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="app">
      {/* doar zona asta derulează — documentul stă pe loc, deci bara de jos din iOS nu mai sare */}
      <div className="screen" ref={screen}>
        <Outlet context={{ openCapture: () => setCapture(true) }} />
      </div>
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
          <Icon name="plus" size={38} stroke={2.6} />
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
