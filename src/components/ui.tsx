import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { STATUS_LABEL, type CompanyStatus } from '../lib/types'
import { Icon, Saw } from './Icon'

// ───────────── Logo firmă ─────────────
export function CompanyLogo({ name, url, size }: { name: string; url: string | null; size?: 'lg' }) {
  const [broken, setBroken] = useState(false)
  const initials = name
    .replace(/\b(s\.?r\.?l\.?|s\.?a\.?|srl|sa)\b/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  if (url && !broken)
    return (
      <div className={`logo-box ${size ?? ''}`}>
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      </div>
    )
  return <div className={`logo-box mono-bg ${size ?? ''}`}>{initials || '?'}</div>
}

export function StatusChip({ status }: { status: CompanyStatus }) {
  return <span className={`chip status status-${status}`}>{STATUS_LABEL[status]}</span>
}

// ───────────── Sheet ─────────────
export function Sheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  // tastatura de pe telefon micșorează zona vizibilă: panoul stă deasupra ei, nu dedesubt
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [])
  // câmpul atins se derulează în vizorul panoului
  const onFocus = (e: { target: EventTarget }) => {
    const el = e.target as HTMLElement
    if (el.matches('input, textarea, select')) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
  }
  // portal în <body>: deasupra barei de jos și a containerului care derulează
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} style={kb ? { paddingBottom: kb } : undefined}>
      <div
        className={`sheet ${kb ? 'kb' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onFocus={onFocus}
        style={kb ? { maxHeight: `calc(100dvh - ${kb}px - 12px)` } : undefined}
      >
        <div className="sheet-handle" />
        {title !== undefined && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Închide">
              <Icon name="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Working({ label }: { label: string }) {
  return (
    <div className="working">
      <Saw size={46} />
      {label}
    </div>
  )
}

export function Empty({ hand, children }: { hand: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="hand">{hand}</span>
      <div className="mute">{children}</div>
    </div>
  )
}

// ───────────── Toast ─────────────
type ToastMsg = { text: string; err?: boolean } | null
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg>(null)
  const show = useCallback((text: string, err?: boolean) => setMsg({ text, err }), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.err ? 5000 : 2600)
    return () => clearTimeout(t)
  }, [msg])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className={`toast ${msg.err ? 'err' : ''}`} role="status" onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ───────────── Date ─────────────
const TZ = 'Europe/Bucharest'
export function fmtDue(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  const today = new Date()
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000)
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  const hasTime = time !== '00:00'
  const day =
    dayDiff === 0 ? 'azi' : dayDiff === 1 ? 'mâine' : dayDiff === -1 ? 'ieri' : d.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
  return { text: hasTime ? `${day}, ${time}` : day, late: d.getTime() < Date.now() }
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })

/** ISO → valoare pentru <input type="datetime-local"> în ora locală. */
export function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)
