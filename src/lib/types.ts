export type CompanyStatus = 'nou' | 'de_contactat' | 'in_discutii' | 'colaborator' | 'arhivat'
export type NoteSource = 'text' | 'voce' | 'ai' | 'scanare'

export interface EventRow {
  id: string
  name: string
  city: string | null
  venue: string | null
  starts_on: string | null
  ends_on: string | null
  notes: string | null
  created_at: string
}

export interface Person {
  id: string
  company_id: string
  full_name: string
  role: string | null
  phone: string | null
  email: string | null
  linkedin: string | null
  notes: string | null
}

export interface Note {
  id: string
  company_id: string
  body: string
  source: NoteSource
  created_by: string | null
  created_at: string
}

export interface Task {
  id: string
  company_id: string
  title: string
  done: boolean
  due_at: string | null
  created_at: string
}

export interface Company {
  id: string
  name: string
  logo_url: string | null
  website: string | null
  domain: string | null
  category: string | null
  products: string[]
  city: string | null
  country: string | null
  address: string | null
  phone: string | null
  email: string | null
  status: CompanyStatus
  rating: number | null
  ai_summary: string | null
  tags: string[]
  event_id: string | null
  created_at: string
  updated_at: string
}

export interface CompanyListItem extends Company {
  people: Pick<Person, 'id' | 'full_name' | 'role' | 'phone'>[]
  tasks: Pick<Task, 'id' | 'done' | 'due_at'>[]
}

export interface CompanyFull extends Company {
  people: Person[]
  notes: Note[]
  tasks: Task[]
  events: Pick<EventRow, 'id' | 'name'> | null
}

/** Ce întoarce AI-ul la extragere (și formularul de editare). */
export interface Draft {
  company: {
    name: string
    website: string | null
    category: string | null
    products: string[]
    city: string | null
    country: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  people: { full_name: string; role: string | null; phone: string | null; email: string | null }[]
  note: string
  tasks: { title: string; due_at: string | null }[]
  tags: string[]
  status: CompanyStatus
}

export const STATUS_LABEL: Record<CompanyStatus, string> = {
  nou: 'Nou',
  de_contactat: 'De contactat',
  in_discutii: 'În discuții',
  colaborator: 'Colaborator',
  arhivat: 'Arhivat',
}

export const STATUSES = Object.keys(STATUS_LABEL) as CompanyStatus[]

export const emptyDraft = (): Draft => ({
  company: { name: '', website: null, category: null, products: [], city: null, country: 'România', address: null, phone: null, email: null },
  people: [],
  note: '',
  tasks: [],
  tags: [],
  status: 'nou',
})
