-- upsert în Storage cere și SELECT pe obiect (pe lângă INSERT/UPDATE)
create policy "echipa citeste logo-uri" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.is_team_member());
