import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useToast, Working } from './components/ui'
import { useQueueFlusher } from './lib/offlineQueue'
import { supabase } from './lib/supabase'
import { Asistent } from './routes/Asistent'
import { Conexiuni } from './routes/Conexiuni'
import { Evenimente } from './routes/Evenimente'
import { Firma } from './routes/Firma'
import { Login } from './routes/Login'
import { Setari } from './routes/Setari'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const qc = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) qc.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const member = useQuery({
    queryKey: ['is_member', session?.user.id],
    enabled: !!session,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_team_member')
      if (error) throw new Error(error.message)
      return data as boolean
    },
  })

  const onQueued = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['companies'] })
    toast('Captură offline procesată ✓')
  }, [qc, toast])
  useQueueFlusher(onQueued, !!session && member.data === true)

  if (session === undefined || (session && member.isLoading)) return <Working label="Mobilator" />
  if (!session) return <Login />
  if (member.error && !navigator.onLine) {
    // offline la pornire: lăsăm aplicația să meargă (capturile intră în coadă)
  } else if (member.data === false) {
    return (
      <div className="login">
        <img src={`${import.meta.env.BASE_URL}logo_light.png`} className="logo" alt="Mobilator" />
        <div className="rigla" style={{ marginBottom: 24 }} />
        <h2>Cont fără acces</h2>
        <p>
          <b>{session.user.email}</b> nu face parte din echipa Mobilator. Roagă un administrator să te adauge din Setări → Echipa.
        </p>
        <button className="btn-l" onClick={() => supabase.auth.signOut()}>
          Deconectare
        </button>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Conexiuni />} />
        <Route path="firma/:id" element={<Firma />} />
        <Route path="evenimente" element={<Evenimente />} />
        <Route path="asistent" element={<Asistent />} />
        <Route path="setari" element={<Setari email={session.user.email ?? ''} />} />
        <Route path="*" element={<Conexiuni />} />
      </Route>
    </Routes>
  )
}
