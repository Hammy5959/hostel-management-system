-- Creates the public "profile-photos" storage bucket used for resident
-- profile pictures (frontend "Choose Photo" upload on the resident form).
--
-- All uploads go through the backend's service-role Supabase client
-- (app/uploads/service.py), which bypasses storage RLS entirely — the
-- frontend never talks to Supabase directly. The bucket is marked public so
-- uploaded photos are servable via a plain public URL with no signing, and
-- no additional storage.objects policies are required for either direction
-- (service-role writes bypass RLS; public-bucket reads bypass it too).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880, -- 5MB, matches app/uploads/service.py's MAX_FILE_SIZE
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
