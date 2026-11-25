import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/Layout'
import { errText, useToast } from '../components/ui'
import { setMember } from '../lib/ai'
import { useTeam, useTeamMutations, type TeamMember } from '../lib/api'
import { exportAll, exportFilename, importAll } from '../lib/export'
import { download } from '../lib/shortcuts'
import { supabase } from '../lib/supabase'

export function Setari({ email }: { email: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { data: team } = useTeam()
  const me = team?.find((m) => m.email === email.toLowerCase())

  async function doExport() {
    setBusy(true)
    try {
      const data = await exportAll()
      download(exportFilename(), JSON.stringify(data, null, 2), 'application/json')
      toast(`Exportat: ${data.companies.length} firme`)
    } catch (e) {
      toast(errText(e), true)
    } finally {
      setBusy(false)
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const r = await importAll(await file.text())
      qc.invalidateQueries()
      toast(`Importat: ${r.companies} firme, ${r.events} evenimente`)
    } catch (e) {
      toast(`Import eșuat: ${errText(e)}`, true)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <TopBar title="Setări" />
      <main className="page">
        <div className="card">
          <div className="label">Conectat ca</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{email}</div>
          {me && <div className="mute" style={{ fontSize: 13 }}>{me.name ?? ''} · {me.role}</div>}
          <ChangePassword />
        </div>

        <div className="section-title">
          <h2>Date</h2>
        </div>
        <div className="stack">
          <button className="btn-l" onClick={doExport} disabled={busy}>
            <Icon name="download" /> Exportă toate conexiunile (JSON)
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
          <button className="btn-l" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="upload" /> Importă din JSON
          </button>
          <p className="mute" style={{ margin: 0, fontSize: 13 }}>
            Importul actualizează după ID: reimportarea aceluiași fișier nu creează duplicate.
          </p>
        </div>

        <Team isAdmin={me?.role === 'admin'} team={team ?? []} />

        <div className="section-title">
          <h2>Aplicație</h2>
        </div>
        <div className="card" style={{ fontSize: 14 }}>
          <b>Instalează pe telefon:</b> în Safari apasă <i>Partajează → Adaugă pe ecranul principal</i>; în Chrome (Android),{' '}
          <i>⋮ → Instalează aplicația</i>.
        </div>

        <div className="divider" />
        <button className="btn ink block" onClick={() => supabase.auth.signOut()}>
          <Icon name="logout" /> Deconectare
        </button>
      </main>
    </>
  )
}

function Team({ isAdmin, team }: { isAdmin: boolean; team: TeamMember[] }) {
  const { remove } = useTeamMutations()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function save() {
    setBusy(true)
    try {
      const existing = team.find((m) => m.email === email.trim().toLowerCase())
      await setMember({ email, password: password || undefined, name: name || existing?.name || null, role: existing?.role ?? 'membru' })
      qc.invalidateQueries({ queryKey: ['team'] })
      toast(existing ? 'Parolă actualizată' : 'Coleg adăugat — se poate loga cu emailul și parola date')
      setEmail('')
      setName('')
      setPassword('')
    } catch (e) {
      toast(errText(e), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-title">
        <h2>Echipa</h2>
        <span className="label">{team.length}</span>
      </div>
      <div className="card">
        {team.map((m) => (
          <div key={m.email} className="person">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{m.name ?? m.email}</div>
              <div className="mute" style={{ fontSize: 13 }}>
                {m.email} · {m.role}
              </div>
            </div>
            {isAdmin && (
              <>
                <button className="btn-l sm" onClick={() => { setEmail(m.email); setName(m.name ?? '') }}>
                  Parolă
                </button>
                <button className="icon-btn" aria-label="Elimină" onClick={() => confirm(`Elimini ${m.email} din echipă?`) && remove.mutate(m.email)}>
                  <Icon name="close" size={18} />
                </button>
              </>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            <div className="label">Adaugă coleg / setează parolă</div>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email coleg" />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="nume (opțional)" />
            <input className="input" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="parolă (min. 6 caractere)" />
            <button className="btn sm" disabled={busy || !email.includes('@') || password.length < 6} onClick={save}>
              <Icon name="plus" size={16} /> {busy ? 'Salvez…' : 'Salvează contul'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function ChangePassword() {
  const [pw, setPw] = useState('')
  const toast = useToast()
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <input className="input grow" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="parolă nouă" />
      <button
        className="btn-l"
        style={{ minHeight: 44 }}
        disabled={pw.length < 6}
        onClick={async () => {
          const { error } = await supabase.auth.updateUser({ password: pw })
          if (error) toast(errText(error), true)
          else {
            toast('Parolă schimbată')
            setPw('')
          }
        }}
      >
        Schimbă
      </button>
    </div>
  )
}
