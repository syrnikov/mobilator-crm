import { useRef, useState } from 'react'
import { uploadLogo } from '../lib/api'
import { cropToPng } from '../lib/media'
import { Icon } from './Icon'
import { errText, useToast } from './ui'

type Box = { x: number; y: number; w: number; h: number }

/** Decupare manuală: tragi cu degetul un dreptunghi peste logo-ul de pe carte → devine poza firmei. */
export function LogoCrop({ src, companyId, onDone }: { src: string; companyId: string; onDone: () => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const rel = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  function down(e: React.PointerEvent) {
    e.preventDefault()
    frame.current!.setPointerCapture(e.pointerId)
    start.current = rel(e)
    setBox({ ...start.current, w: 0, h: 0 })
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return
    const p = rel(e)
    const s = start.current
    setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  function up() {
    start.current = null
  }

  async function use() {
    if (!box) return
    setBusy(true)
    try {
      await uploadLogo(companyId, await cropToPng(src, box))
      toast('Logo actualizat')
      onDone()
    } catch (e) {
      toast(errText(e), true)
    } finally {
      setBusy(false)
    }
  }

  const ok = !!box && box.w > 0.03 && box.h > 0.03
  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 15 }}>
        Trage cu degetul un dreptunghi în jurul logo-ului.
      </p>
      <div
        ref={frame}
        className="crop-frame"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <img src={src} alt="Carte de vizită" crossOrigin="anonymous" draggable={false} />
        {box && (
          <div
            className="crop-box"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
          />
        )}
      </div>
      <button className="btn block" disabled={!ok || busy} onClick={use}>
        <Icon name="check" /> {busy ? 'Salvez…' : 'Folosește ca logo'}
      </button>
    </div>
  )
}
