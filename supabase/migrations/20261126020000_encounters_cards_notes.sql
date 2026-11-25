-- Întâlniri (unde am cunoscut firma — poate fi la mai multe târguri), poze cărți de vizită,
-- notițe pliabile, potrivire automată la rescanare.

-- ───────────── Întâlniri ─────────────
create table public.encounters (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id   uuid references public.events(id) on delete set null,
  place      text,
  met_on     date not null default current_date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.encounters (company_id);
create index on public.encounters (event_id);
create unique index encounters_once_per_event on public.encounters (company_id, event_id) where event_id is not null;

alter table public.encounters enable row level security;
create policy "echipa acces complet" on public.encounters for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
grant select, insert, update, delete on public.encounters to authenticated;
revoke all on public.encounters from anon;

-- firmele existente legate de un eveniment devin prima lor întâlnire
insert into public.encounters (company_id, event_id, met_on, created_by)
select id, event_id, created_at::date, created_by from public.companies where event_id is not null
on conflict do nothing;

-- ───────────── Cărți de vizită + notițe pliabile ─────────────
alter table public.companies add column card_images text[] not null default '{}';
alter table public.notes add column collapsed boolean not null default false;

insert into storage.buckets (id, name, public) values ('carti', 'carti', false)
on conflict (id) do nothing;

create policy "echipa citeste carti" on storage.objects for select to authenticated
  using (bucket_id = 'carti' and public.is_team_member());
create policy "echipa scrie carti" on storage.objects for insert to authenticated
  with check (bucket_id = 'carti' and public.is_team_member());
create policy "echipa sterge carti" on storage.objects for delete to authenticated
  using (bucket_id = 'carti' and public.is_team_member());

-- ───────────── Potrivire: există deja firma? (telefon / email / CUI / nume) ─────────────
create or replace function public.match_companies(
  p_name text, p_phones text[] default '{}', p_emails text[] default '{}', p_registry text default null
)
returns table (id uuid, name text, city text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  with ph as (
    select distinct right(regexp_replace(x, '\D', '', 'g'), 8) d from unnest(p_phones) x
    where length(regexp_replace(x, '\D', '', 'g')) >= 8
  ),
  em as (select distinct lower(trim(x)) e from unnest(p_emails) x where x like '%@%'),
  hits as (
    select c.id, 'cod fiscal' reason, 100 score from companies c
      where p_registry is not null and p_registry <> '' and c.registry_id = regexp_replace(p_registry, '\D', '', 'g')
    union all
    select c.id, 'telefon', 90 from companies c join ph on right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 8) = ph.d
    union all
    select p.company_id, 'telefon', 90 from people p join ph on right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 8) = ph.d
    union all
    select c.id, 'email', 90 from companies c join em on lower(c.email) = em.e
    union all
    select p.company_id, 'email', 90 from people p join em on lower(p.email) = em.e
    union all
    select s.id, 'nume', 50 from public.search_companies(p_name, 3) s
      where coalesce(p_name, '') <> ''
  )
  select c.id, c.name, c.city, (array_agg(h.reason order by h.score desc))[1], max(h.score)::int
  from hits h join companies c on c.id = h.id
  group by c.id, c.name, c.city
  order by max(h.score) desc, c.updated_at desc
  limit 3;
$$;
grant execute on function public.match_companies(text, text[], text[], text) to authenticated;
