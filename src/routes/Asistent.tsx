import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarSheet } from '../components/CalendarSheet'
import { Icon, Saw } from '../components/Icon'
import { TopBar } from '../components/Layout'
import { errText, fmtDateTime, useToast } from '../components/ui'
import { chat, transcribeAudio, type CalendarProposal, type ChatMessage } from '../lib/ai'
import { useInvalidate } from '../lib/api'
import { useCurrentEvent } from '../lib/currentEvent'
import { fmtSeconds, useRecorder } from '../lib/media'

const KEY = 'mobilator.chat'
const SUGGESTIONS = [
  'Ce am de făcut săptămâna asta?',
  'Ce firme de MDF am cunoscut la ultimul târg?',
  'Adaugă: Maria Ionescu, designer interior din Brașov, 0722 123 456, vrea mostre de fronturi',
  'Caută mai multe informații despre ultima firmă adăugată',
]

export function Asistent() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [cal, setCal] = useState<CalendarProposal | null>(null)
  const rec = useRecorder()
  const ev = useCurrentEvent()
  const toast = useToast()
  const invalidate = useInvalidate()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(messages.slice(-40)))
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function send(content: string) {
    if (!content.trim() || thinking) return
    const next = [...messages, { role: 'user' as const, content: content.trim() }]
    setMessages(next)
    setText('')
    setThinking(true)
    try {
      const r = await chat(next, ev)
      setMessages([...next, { role: 'assistant', content: r.reply, actions: r.actions }])
      if (r.changed) invalidate()
    } catch (e) {
      toast(errText(e), true)
      setMessages(next)
    } finally {
      setThinking(false)
    }
  }

  async function mic() {
    if (!rec.recording) {
      try {
        await rec.start()
      } catch {
        toast('Nu am acces la microfon', true)
      }
      return
    }
    const blob = await rec.stop()
    setThinking(true)
    try {
      const t = await transcribeAudio(blob)
      setThinking(false)
      await send(t)
    } catch (e) {
      toast(errText(e), true)
      setThinking(false)
    }
  }

  return (
    <>
      <TopBar
        title="Asistent AI"
        right={
          messages.length > 0 && (
            <button className="btn-l sm" onClick={() => setMessages([])}>
              Conversație nouă
            </button>
          )
        }
      />
      <main className="page" style={{ paddingBottom: 16 }}>
        {messages.length === 0 && (
          <div className="stack">
            <p className="mute" style={{ margin: 0 }}>
              Întreabă orice despre conexiunile tale, cere-i să adauge sau să actualizeze contacte, să programeze un apel sau să caute o
              firmă pe web. <span className="hand" style={{ color: 'var(--or-dk)' }}>vorbește liber.</span>
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
              {m.actions && m.actions.length > 0 && (
                <div className="row wrap" style={{ marginTop: 8 }}>
                  {m.actions.map((a, j) =>
                    a.type === 'company' ? (
                      <Link key={j} to={`/firma/${a.id}`} className="chip or" style={{ textDecoration: 'none' }}>
                        <Icon name="link" size={13} /> {a.name}
                      </Link>
                    ) : (
                      <button key={j} className="chip ink" onClick={() => setCal(a.event)}>
                        <Icon name="calendar" size={13} /> {a.event.title} · {fmtDateTime(a.event.start)}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="bubble assistant row">
              <Saw size={20} /> <span className="mute">mă gândesc…</span>
            </div>
          )}
          <div ref={end} />
        </div>
      </main>

      <div className="chat-input">
        <div className="inner">
          <textarea
            className="textarea grow"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(text)
              }
            }}
            placeholder={rec.recording ? `Ascult… ${fmtSeconds(rec.seconds)}` : 'Scrie sau dictează…'}
            disabled={rec.recording}
          />
          {text.trim() ? (
            <button className="btn" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => send(text)} disabled={thinking} aria-label="Trimite">
              <Icon name="send" />
            </button>
          ) : (
            <button className={`btn ${rec.recording ? 'ink' : ''}`} style={{ minHeight: 44, padding: '0 14px' }} onClick={mic} disabled={thinking} aria-label="Dictează">
              <Icon name={rec.recording ? 'stop' : 'mic'} fill={rec.recording} />
            </button>
          )}
        </div>
      </div>

      {cal && (
        <CalendarSheet
          initial={{
            title: cal.title,
            start: new Date(cal.start),
            end: cal.end ? new Date(cal.end) : undefined,
            location: cal.location,
            description: cal.description,
          }}
          onClose={() => setCal(null)}
        />
      )}
    </>
  )
}
