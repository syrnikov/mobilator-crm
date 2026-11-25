-- Date de registru și financiare (ANAF pentru România, datero.md pentru Moldova)

alter table public.companies
  add column registry_id     text,
  add column legal_name      text,
  add column legal_form      text,
  add column registry_status text,
  add column activity_code   text,
  add column activity_name   text,
  add column founded_on      date,
  add column employees       integer,
  add column vat_payer       boolean,
  add column administrators  text[] not null default '{}',
  add column financials      jsonb not null default '[]',
  add column socials         jsonb not null default '{}',
  add column registry_source text,
  add column registry_url    text,
  add column enriched_at     timestamptz;

create index companies_registry_id_idx on public.companies (registry_id);

-- Căutarea include și CUI/IDNO, denumirea legală și activitatea
create or replace function public.refresh_company_search(cid uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.companies c set search =
    to_tsvector('simple', public.immutable_unaccent(
      coalesce(c.name, '') || ' ' || coalesce(c.legal_name, '') || ' ' || coalesce(c.registry_id, '') || ' ' ||
      coalesce(c.category, '') || ' ' || coalesce(c.activity_name, '') || ' ' ||
      array_to_string(c.products, ' ') || ' ' || array_to_string(c.tags, ' ') || ' ' ||
      coalesce(c.city, '') || ' ' || coalesce(c.ai_summary, '') || ' ' ||
      array_to_string(c.administrators, ' ') || ' ' ||
      coalesce((select string_agg(coalesce(p.full_name,'') || ' ' || coalesce(p.role,''), ' ')
                from public.people p where p.company_id = c.id), '') || ' ' ||
      coalesce((select string_agg(n.body, ' ') from public.notes n where n.company_id = c.id), '')
    ))
  where c.id = cid;
end;
$$;

drop trigger companies_search on public.companies;
create trigger companies_search after insert or update of
  name, legal_name, registry_id, category, activity_name, products, tags, city, ai_summary, administrators
on public.companies for each row execute function public.trg_company_search();
