import { useState } from 'react'
import { telegramUrl, whatsappUrl } from '../lib/shortcuts'
import { Icon } from './Icon'
import { Sheet, useToast } from './ui'

export const PRESENTATION_URL = 'https://mobilator.ro/prezentare/'

export type MessageTarget = {
  app: 'whatsapp' | 'telegram'
  phone: string
  /** prenumele persoanei, pentru salut */
  name?: string | null
  eventName?: string | null
}

const firstName = (n?: string | null) => (n ? n.trim().split(/\s+/)[0] : '')

export function presentationMessage(t: Pick<MessageTarget, 'name' | 'eventName'>) {
  const hi = firstName(t.name) ? `Bună ziua, ${firstName(t.name)}!` : 'Bună ziua!'
  const met = t.eventName ? ` Ne-am cunoscut la ${t.eventName}.` : ''
  return `${hi} Sunt de la Mobilator.${met} Vă las aici prezentarea noastră: ${PRESENTATION_URL}\nMă bucur să rămânem în legătură!`
}

/** Alegere la WhatsApp / Telegram: doar deschide chatul sau trimite prezentarea Mobilator (mesaj precompletat). */
export function MessageSheet({ target, onClose }: { target: MessageTarget; onClose: () => void }) {
  const [text, setText] = useState(() => presentationMessage(target))
  const toast = useToast()
  const label = target.app === 'whatsapp' ? 'WhatsApp' : 'Telegram'

  function openChat() {
    window.open(target.app === 'whatsapp' ? whatsappUrl(target.phone) : telegramUrl(target.phone), '_blank')
    onClose()
  }

  async function sendPresentation() {
    if (target.app === 'whatsapp') {
      // WhatsApp acceptă textul direct în link → câmpul de mesaj vine completat
      window.open(whatsappUrl(target.phone, text), '_blank')
    } else {
      // Telegram nu permite precompletarea mesajului pentru un număr de telefon:
      // copiem textul, deschidem chatul și utilizatorul doar lipește
      try {
        await navigator.clipboard.writeText(text)
        toast('Mesaj copiat — în Telegram ține apăsat în câmpul de mesaj și alege „Lipește”')
      } catch {
        toast('Nu am putut copia mesajul', true)
      }
      window.open(telegramUrl(target.phone), '_blank')
    }
    onClose()
  }

  return (
    <Sheet title={label} onClose={onClose}>
      <div className="stack">
        <button className="btn-l" onClick={openChat}>
          <Icon name={target.app} /> Doar deschide chatul
        </button>
        <div className="divider" style={{ height: 1, background: 'var(--line)', margin: '6px 0' }} />
        <div className="field">
          <label className="label">Mesaj cu prezentarea Mobilator</label>
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn block" onClick={sendPresentation} disabled={!text.trim()}>
          <Icon name="send" /> Trimite prezentarea pe {label}
        </button>
        {target.app === 'telegram' && (
          <p className="mute" style={{ margin: 0, fontSize: 14 }}>
            Telegram nu acceptă mesaje precompletate pentru numere de telefon, așa că textul se copiază și îl lipești în chat.
          </p>
        )}
      </div>
    </Sheet>
  )
}
