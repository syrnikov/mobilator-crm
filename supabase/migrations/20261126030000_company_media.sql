-- Poze & video încărcate de echipă pe fișa firmei (căi în bucketul privat „carti”)
alter table public.companies add column if not exists media text[] not null default '{}';
