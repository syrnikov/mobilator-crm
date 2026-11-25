-- Mobilator CRM — schema inițială
-- Date partajate de echipă; acces doar pentru emailurile din team_members.

create extension if not exists unaccent with schema extensions;

-- ───────────── Echipă (allowlist) ─────────────
create table public.team_members (
  email      text primary key,
  name       text,
  role       text not null default 'membru' check (role in ('admin', 'membru')),
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_team_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'admin'
  );
$$;

-- ───────────── Evenimente (târguri, întâlniri) ─────────────
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text,
  venue      text,
  starts_on  date,
  ends_on    date,
  notes      text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────── Companii ─────────────
create type public.company_status as enum ('nou', 'de_contactat', 'in_discutii', 'colaborator', 'arhivat');

create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  website    text,
  domain     text,
  category   text,
  products   text[] not null default '{}',
  city       text,
  country    text default 'România',
  address    text,
  phone      text,
  email      text,
  status     public.company_status not null default 'nou',
  rating     smallint check (rating between 1 and 5),
  ai_summary text,
  tags       text[] not null default '{}',
  event_id   uuid references public.events(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Persoane ─────────────
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name  text not null,
  role       text,
  phone      text,
  email      text,
  linkedin   text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ───────────── Notițe ─────────────
create type public.note_source as enum ('text', 'voce', 'ai', 'scanare');

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  body       text not null,
  source     public.note_source not null default 'text',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────── Sarcini / checklist ─────────────
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  due_at     timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.people (company_id);
create index on public.notes (company_id, created_at desc);
create index on public.tasks (company_id);
create index on public.companies (event_id);
create index on public.companies (updated_at desc);

-- ───────────── Căutare full-text (fără diacritice) ─────────────
create or replace function public.immutable_unaccent(text)
returns text language sql immutable parallel safe set search_path = public, extensions
as $$ select unaccent($1) $$;

alter table public.companies add column search tsvector;
create index companies_search_idx on public.companies using gin (search);

create or replace function public.refresh_company_search(cid uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.companies c set search =
    to_tsvector('simple', public.immutable_unaccent(
      coalesce(c.name, '') || ' ' || coalesce(c.category, '') || ' ' ||
      array_to_string(c.products, ' ') || ' ' || array_to_string(c.tags, ' ') || ' ' ||
      coalesce(c.city, '') || ' ' || coalesce(c.ai_summary, '') || ' ' ||
      coalesce((select string_agg(coalesce(p.full_name,'') || ' ' || coalesce(p.role,''), ' ')
                from public.people p where p.company_id = c.id), '') || ' ' ||
      coalesce((select string_agg(n.body, ' ') from public.notes n where n.company_id = c.id), '')
    ))
  where c.id = cid;
end;
$$;

create or replace function public.trg_company_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_touch before update on public.companies
for each row when (old.search is not distinct from new.search) execute function public.trg_company_touch();

create or replace function public.trg_company_search()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'companies' then
    perform public.refresh_company_search(new.id);
  else
    perform public.refresh_company_search(coalesce(new.company_id, old.company_id));
    update public.companies set updated_at = now() where id = coalesce(new.company_id, old.company_id);
  end if;
  return null;
end;
$$;

create trigger companies_search after insert or update of name, category, products, tags, city, ai_summary
on public.companies for each row execute function public.trg_company_search();
create trigger people_search after insert or update or delete on public.people
for each row execute function public.trg_company_search();
create trigger notes_search after insert or update or delete on public.notes
for each row execute function public.trg_company_search();
create trigger tasks_touch after insert or update or delete on public.tasks
for each row execute function public.trg_company_search();

-- Căutare folosită de aplicație și de asistentul AI (respectă RLS: security invoker)
create or replace function public.search_companies(q text, max_results int default 30)
returns setof public.companies
language sql stable security invoker set search_path = public
as $$
  select * from public.companies
  where q is null or q = ''
     or search @@ to_tsquery('simple',
          array_to_string(array(
            select lexeme || ':*' from unnest(string_to_array(trim(regexp_replace(public.immutable_unaccent(lower(q)), '[^[:alnum:] ]', ' ', 'g')), ' ')) lexeme
            where lexeme <> ''
          ), ' & '))
     or public.immutable_unaccent(lower(name)) like '%' || public.immutable_unaccent(lower(q)) || '%'
  order by updated_at desc
  limit max_results;
$$;

-- ───────────── RLS ─────────────
alter table public.team_members enable row level security;
alter table public.events       enable row level security;
alter table public.companies    enable row level security;
alter table public.people       enable row level security;
alter table public.notes        enable row level security;
alter table public.tasks        enable row level security;

create policy "echipa citeste membrii" on public.team_members for select to authenticated using (public.is_team_member());
create policy "admin gestioneaza membrii" on public.team_members for all to authenticated
  using (public.is_team_admin()) with check (public.is_team_admin());

do $$
declare t text;
begin
  foreach t in array array['events', 'companies', 'people', 'notes', 'tasks'] loop
    execute format('create policy "echipa acces complet" on public.%I for all to authenticated
                    using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
end $$;

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "echipa scrie logo-uri" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_team_member());
create policy "echipa actualizeaza logo-uri" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_team_member());
create policy "echipa sterge logo-uri" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_team_member());

-- ───────────── Granturi explicite (nu depindem de auto-expose) ─────────────
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.team_members, public.events, public.companies,
  public.people, public.notes, public.tasks to authenticated;
grant execute on function public.is_team_member(), public.is_team_admin(),
  public.search_companies(text, int) to authenticated;
revoke all on public.team_members, public.events, public.companies, public.people, public.notes, public.tasks from anon;
