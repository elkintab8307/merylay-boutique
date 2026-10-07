insert into storage.buckets (id, name, public)
values ('whatsapp-docs', 'whatsapp-docs', false)
on conflict (id) do nothing;

-- Solo service_role sube/lee directo; los clientes reciben un link
-- firmado de corta duracion que el bot genera, nunca acceso a la API de
-- Storage.
create policy "whatsapp_docs_service_role_all"
  on storage.objects for all
  using (bucket_id = 'whatsapp-docs' and auth.role() = 'service_role')
  with check (bucket_id = 'whatsapp-docs' and auth.role() = 'service_role');
