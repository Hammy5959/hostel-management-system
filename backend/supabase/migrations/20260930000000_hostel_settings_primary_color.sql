-- Settings → Branding primary color. Nullable: null = use the app default
-- (or NEXT_PUBLIC_BRAND_COLOR, which has priority — see frontend
-- lib/branding.ts). Stored normalized as lowercase "#rrggbb"; the API
-- validates the same format (app.hostel_settings.schemas).

alter table public.hostel_settings add column if not exists primary_color text;

alter table public.hostel_settings drop constraint if exists hostel_settings_primary_color_hex;
alter table public.hostel_settings
  add constraint hostel_settings_primary_color_hex
  check (primary_color is null or primary_color ~ '^#[0-9a-f]{6}$');
