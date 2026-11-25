import { useState } from 'react'
import { Icon } from '../components/Icon'
import { isConfigured, supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('mobilator.lastEmail') ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const em = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({ email: em, password })
    setBusy(false)
    if (error) {
      setError(
        /invalid login credentials/i.test(error.message)
          ? 'Email sau parolă greșită. Dacă nu ai cont sau ai uitat parola, cere-i administratorului să ți-o seteze.'
          : error.message,
      )
    } else localStorage.setItem('mobilator.lastEmail', em)
  }

  return (
    <div className="login">
      <img src={`${import.meta.env.BASE_URL}logo_light.png`} className="logo" alt="Mobilator" />
      <div className="rigla" style={{ marginBottom: 24 }} />
      <h1>Conexiuni de la târguri</h1>
      <p className="mute" style={{ marginTop: 6 }}>
        Carnetul de notițe AI al echipei Mobilator. <span className="hand" style={{ color: 'var(--or-dk)' }}>fără hârtiuțe.</span>
      </p>

      {!isConfigured && (
        <div className="banner" style={{ margin: '16px 0' }}>
          Lipsesc <span className="mono">VITE_SUPABASE_URL</span> și <span className="mono">VITE_SUPABASE_ANON_KEY</span> în fișierul <span className="mono">.env</span>.
        </div>
      )}

      <form onSubmit={login} className="stack" style={{ marginTop: 20 }}>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nume@firma.ro" />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Parolă</label>
          <div className="row">
            <input
              id="password"
              className="input grow"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="btn-l" style={{ minHeight: 44 }} onClick={() => setShow(!show)}>
              {show ? 'Ascunde' : 'Arată'}
            </button>
          </div>
        </div>
        <button className="btn block" disabled={busy || !isConfigured}>
          <Icon name="check" /> {busy ? 'Intru…' : 'Intră în cont'}
        </button>
        {error && <div className="banner">{error}</div>}
      </form>
    </div>
  )
}
