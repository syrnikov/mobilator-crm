import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractDraft, researchCompany, transcribeAudio } from '../lib/ai'
import { companyHasLogo, saveDraft, uploadCardImages, uploadLogo, useInvalidate } from '../lib/api'
import { useCurrentEvent } from '../lib/currentEvent'
import { cropToPng, fmtSeconds, imageToDataUrl, useRecorder } from '../lib/media'
import { enqueue } from '../lib/offlineQueue'
import { emptyDraft, type Draft, type NoteSource } from '../lib/types'
import { DraftForm } from './DraftForm'
import { Icon } from './Icon'
import { errText, Sheet, useToast, Working } from './ui'

type Mode = 'voce' | 'text' | 'scanare'
type Step = 'input' | 'working' | 'review' | 'saving'

/** Captură rapidă: dictezi / scrii / fotografiezi cartea de vizită → AI → fișă editabilă → salvare. */
export function CaptureSheet({ onClose, initialMode = 'voce' }: { onClose: () => void; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>('input')
  const [workLabel, setWorkLabel] = useState('')
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [into, setInto] = useState<{ id: string; name: string } | null>(null)
  const [source, setSource] = useState<NoteSource>('text')
  const [place, setPlace] = useState('')
  const rec = useRecorder()
  const ev = useCurrentEvent()
  const toast = useToast()
  const nav = useNavigate()
  const invalidate = useInvalidate()
  const fileRef = useRef<HTMLInputElement>(null)

  async function process(input: { text?: string; images?: string[]; audio?: Blob }, src: NoteSource) {
    setSource(src)
    if (!navigator.onLine) {
      await enqueue({ eventId: ev?.id ?? null, ...input })
      toast('Fără internet — captura e salvată și se procesează automat la reconectare.')
      onClose()
      return
    }
    try {
      setStep('working')
      let t = input.text ?? ''
      if (input.audio) {
        setWorkLabel('Transcriu…')
        t = await transcribeAudio(input.audio)
        setText(t)
      }
      setWorkLabel(input.images?.length ? 'Citesc cartea de vizită…' : 'Organizez informațiile…')
      const d = await extractDraft({ text: t || undefined, images: input.images })
      if (src === 'voce' && t) d.note = d.note ? `${d.note}\n\n— Dictat: „${t}”` : t
      setDraft(d)
      setStep('review')
    } catch (e) {
      toast(errText(e), true)
      setStep('input')
    }
  }

  async function toggleRecording() {
    if (rec.recording) {
      const blob = await rec.stop()
      if (blob.size < 2000) return toast('Înregistrarea e prea scurtă', true)
      process({ audio: blob }, 'voce')
    } else {
      try {
        await rec.start()
      } catch {
        toast('Nu am acces la microfon. Verifică permisiunile browserului.', true)
      }
    }
  }

  async function onPhotos(files: FileList | null) {
    if (!files?.length) return
    const urls = await Promise.all([...files].slice(0, 2).map((f) => imageToDataUrl(f)))
    setImages((prev) => [...prev, ...urls].slice(0, 2))
  }

  async function save() {
    if (!draft) return
    if (!into && !draft.company.name.trim()) return toast('Completează numele firmei', true)
    setStep('saving')
    try {
      const id = await saveDraft(draft, { eventId: ev?.id ?? null, source, intoCompanyId: into?.id, place })
      let logoMsg = ''
      if (images.length) {
        // poza cărții se păstrează pe fișă; logo-ul se decupează de pe carte dacă firma nu are unul
        await uploadCardImages(id, images).catch((e) => toast(`Poza cărții nu s-a salvat: ${errText(e)}`, true))
        const box = draft.logo_box
        if (!(await companyHasLogo(id))) {
          if (box && images[box.image]) {
            try {
              await uploadLogo(id, await cropToPng(images[box.image], box))
              logoMsg = ' · logo decupat de pe carte'
            } catch (e) {
              logoMsg = ` · logo nedecupat (${errText(e)})`
            }
          } else {
            logoMsg = ' · n-am găsit logo pe carte — îl poți decupa din poza cărții'
          }
        }
      }
      invalidate(id)
      toast((into ? `Adăugat la ${into.name}` : 'Conexiune salvată ✓') + logoMsg)
      onClose()
      nav(`/firma/${id}`)
      // firmă nouă: căutăm în fundal rețele sociale, logo, site și date oficiale
      if (!into && navigator.onLine) {
        researchCompany(id)
          .then(() => invalidate(id))
          .catch(() => {})
      }
    } catch (e) {
      toast(errText(e), true)
      setStep('review')
    }
  }

  const title = step === 'review' ? 'Verifică fișa' : 'Conexiune nouă'

  return (
    <Sheet title={title} onClose={() => (rec.recording ? rec.cancel() : onClose())}>
      {ev && step !== 'review' && (
        <div className="label" style={{ marginTop: -6, marginBottom: 12 }}>
          ● {ev.name}
        </div>
      )}

      {step === 'input' && (
        <>
          <div className="modes" role="tablist">
            {(
              [
                ['voce', 'mic', 'Dictează'],
                ['text', 'keyboard', 'Scrie'],
                ['scanare', 'camera', 'Carte vizită'],
              ] as const
            ).map(([m, icon, label]) => (
              <button key={m} aria-pressed={mode === m} onClick={() => !rec.recording && setMode(m)}>
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>

          {mode === 'voce' && (
            <div style={{ textAlign: 'center' }}>
              <button className={`mic-big ${rec.recording ? 'rec' : ''}`} onClick={toggleRecording} aria-label={rec.recording ? 'Oprește' : 'Înregistrează'}>
                <Icon name={rec.recording ? 'stop' : 'mic'} size={48} stroke={2} fill={rec.recording} />
              </button>
              {rec.recording ? (
                <div className="timer">{fmtSeconds(rec.seconds)}</div>
              ) : (
                <p className="mute" style={{ margin: '4px 12px 0' }}>
                  Atinge și spune liber: firma, cu cine ai vorbit, ce fac, telefonul, ce urmează.
                  <br />
                  <span className="hand" style={{ color: 'var(--or-dk)' }}>„Am vorbit cu Ion de la Lemn Art Cluj…”</span>
                </p>
              )}
            </div>
          )}

          {mode === 'text' && (
            <div className="stack">
              <textarea
                className="textarea"
                rows={6}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Scrie cum îți vine — AI-ul face ordine: firmă, persoane, telefon, ce s-a discutat, ce urmează."
              />
              <button className="btn block" disabled={!text.trim()} onClick={() => process({ text }, 'text')}>
                <Icon name="sparkle" /> Organizează cu AI
              </button>
            </div>
          )}

          {mode === 'scanare' && (
            <div className="stack">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onPhotos(e.target.files)} />
              {images.length > 0 && (
                <div className="photo-preview">
                  {images.map((src, i) => (
                    <img key={i} src={src} alt={`Poză ${i + 1}`} />
                  ))}
                </div>
              )}
              <button className="btn-l" onClick={() => fileRef.current?.click()}>
                <Icon name="camera" /> {images.length ? 'Încă o poză (verso)' : 'Fotografiază cartea de vizită'}
              </button>
              <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Notiță opțională (ce ați discutat)" />
              <button className="btn block" disabled={!images.length} onClick={() => process({ images, text: text || undefined }, 'scanare')}>
                <Icon name="sparkle" /> Citește cu AI
              </button>
            </div>
          )}

          <div className="divider" style={{ height: 1, background: 'var(--line)' }} />
          <button
            className="btn-l sm"
            style={{ width: '100%' }}
            onClick={() => {
              setDraft(emptyDraft())
              setSource('text')
              setStep('review')
            }}
          >
            Completează manual, fără AI
          </button>
        </>
      )}

      {step === 'working' && <Working label={workLabel} />}

      {(step === 'review' || step === 'saving') && draft && (
        <>
          <DraftForm draft={draft} onChange={setDraft} intoCompany={into} onIntoCompany={setInto} />
          <div className="field" style={{ marginTop: 12 }}>
            <label className="label">Unde v-ați întâlnit {ev ? `(pe lângă ${ev.name})` : ''}</label>
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="ex: stand B12, Moldexpo · cină cu furnizorii" />
          </div>
          <div className="row" style={{ marginTop: 18, position: 'sticky', bottom: 0 }}>
            <button className="btn-l" onClick={() => setStep('input')} disabled={step === 'saving'}>
              Înapoi
            </button>
            <button className="btn grow" onClick={save} disabled={step === 'saving'}>
              <Icon name="check" /> {step === 'saving' ? 'Salvez…' : 'Salvează'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
