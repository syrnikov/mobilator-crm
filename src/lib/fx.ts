import { useQuery } from '@tanstack/react-query'
import type { FinancialYear } from './types'

/** Curs de rezervă dacă API-ul de curs nu răspunde (MDL pentru 1 EUR). */
const FALLBACK_MDL_PER_EUR = 20

/** Curs MDL/EUR zilnic (open.er-api.com, gratuit, fără cheie), cache 12 h. */
export function useMdlRate() {
  return useQuery({
    queryKey: ['fx', 'EUR-MDL'],
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    queryFn: async () => {
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/EUR')
        const j = await r.json()
        const v = Number(j?.rates?.MDL)
        return v > 1 ? v : FALLBACK_MDL_PER_EUR
      } catch {
        return FALLBACK_MDL_PER_EUR
      }
    },
    placeholderData: FALLBACK_MDL_PER_EUR,
  }).data ?? FALLBACK_MDL_PER_EUR
}

const MONEY: (keyof FinancialYear)[] = ['revenue', 'net_profit', 'total_assets', 'equity', 'debts', 'fixed_assets', 'current_assets']

/** Transformă anii raportați în MDL în EUR (restul rămân neschimbați). */
export function toEur(years: FinancialYear[], mdlPerEur: number): FinancialYear[] {
  return years.map((f) => {
    if (f.currency !== 'MDL') return f
    const out = { ...f, currency: 'EUR' as const }
    for (const k of MONEY) {
      const v = f[k] as number | null | undefined
      if (typeof v === 'number') (out as Record<string, unknown>)[k] = Math.round(v / mdlPerEur)
    }
    return out
  })
}
