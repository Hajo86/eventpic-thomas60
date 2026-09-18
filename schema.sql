-- ===========================================================================
--  eventpic — Supabase-Setup
--  Einmal komplett in den SQL-Editor von Supabase einfügen und ausführen.
--  Projekt-Region: EU (Frankfurt) wählen.
--
--  Alle Objekte sind mit "event_" / "ep_" / "eventpic" benannt, damit dieses
--  Schema neben einer bestehenden Datenbank (z.B. der RSS-Akquise mit ihrer
--  Tabelle "leads" und dem Bucket "lead-photos") laufen kann, ohne etwas
--  anzufassen. Es wird nichts gelöscht und keine fremde Policy verändert.
--
--  ACHTUNG, bevor du dieses Schema in ein BESTEHENDES Projekt legst:
--  Der Anon-Key steckt bei jedem Partygast im Browser. Er gilt für das ganze
--  Projekt. Wenn in derselben Datenbank Tabellen mit offenen Policies liegen
--  (bei der RSS-App ist "leads" per "using (true)" für anon voll lesbar UND
--  schreibbar), bekäme jeder Gast damit Zugriff darauf. Für das Fest deshalb
--  ein EIGENES, zweites Supabase-Projekt anlegen — ist kostenlos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
create table if not exists public.event_photos (
  id          uuid primary key default gen_random_uuid(),
  event_id    text        not null,
  task_id     text        not null,
  guest_name  text,
  caption     text,
  path        text        not null,          -- Pfad im Storage-Bucket
  owner_token text        not null,          -- anonyme Gerätekennung (für "eigenes Foto löschen")
  width       integer,
  height      integer,
  hidden      boolean     not null default false,
  created_at  timestamptz not null default now(),
  constraint caption_len   check (caption is null or char_length(caption) <= 140),
  constraint guest_len     check (guest_name is null or char_length(guest_name) <= 24),
  constraint task_len      check (char_length(task_id) between 1 and 24),
  constraint path_len      check (char_length(path) between 1 and 300),
  constraint token_len     check (char_length(owner_token) between 8 and 64)
);

create index if not exists event_photos_created_idx
  on public.event_photos (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
--    anon darf: lesen (nur sichtbare) + einfügen.
--    anon darf NICHT: ändern oder löschen — das läuft über die Funktionen unten.
-- ---------------------------------------------------------------------------
alter table public.event_photos enable row level security;

drop policy if exists "eventpic anon liest sichtbare fotos" on public.event_photos;
create policy "eventpic anon liest sichtbare fotos"
  on public.event_photos for select to anon
  using (hidden = false);

drop policy if exists "eventpic anon darf einfuegen" on public.event_photos;
create policy "eventpic anon darf einfuegen"
  on public.event_photos for insert to anon
  with check (hidden = false);

-- ---------------------------------------------------------------------------
-- 3. Admin-PIN (liegt in einem Schema, das die REST-API NICHT ausliefert)
-- ---------------------------------------------------------------------------
create schema if not exists eventpic_private;
revoke all on schema eventpic_private from anon, authenticated;

create table if not exists eventpic_private.admin (
  event_id text primary key,
  pin      text not null
);

-- >>> PIN HIER ÄNDERN <<<
insert into eventpic_private.admin (event_id, pin)
values ('thomas60-2026', 'BITTE-AENDERN-0000')
on conflict (event_id) do update set pin = excluded.pin;

-- ---------------------------------------------------------------------------
-- 4. Funktionen
-- ---------------------------------------------------------------------------

-- 4a. Gast löscht sein eigenes Foto (nur mit passendem owner_token)
create or replace function public.ep_delete_own_photo(p_id uuid, p_token text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  if p_token is null or char_length(p_token) < 8 then
    raise exception 'ungueltiges Token';
  end if;
  delete from public.event_photos where id = p_id and owner_token = p_token;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 4b. PIN-Prüfung
create or replace function eventpic_private.pin_ok(p_pin text, p_event text)
returns boolean
language sql
security definer
set search_path = eventpic_private, pg_temp
as $$
  select exists (
    select 1 from eventpic_private.admin
    where pin = p_pin and (p_event is null or event_id = p_event)
  );
$$;

-- 4c. Admin: alle Fotos inklusive verborgener
create or replace function public.ep_admin_list(p_pin text, p_event text)
returns setof public.event_photos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not eventpic_private.pin_ok(p_pin, p_event) then raise exception 'PIN falsch'; end if;
  return query
    select * from public.event_photos
    where event_id = p_event
    order by created_at desc;
end;
$$;

-- 4d. Admin: Foto verbergen / wieder zeigen
create or replace function public.ep_admin_set_hidden(p_pin text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not eventpic_private.pin_ok(p_pin, null) then raise exception 'PIN falsch'; end if;
  update public.event_photos set hidden = p_hidden where id = p_id;
end;
$$;

-- 4e. Admin: Foto endgültig löschen (Datenbankzeile + Storage-Eintrag)
create or replace function public.ep_admin_delete(p_pin text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p text;
begin
  if not eventpic_private.pin_ok(p_pin, null) then raise exception 'PIN falsch'; end if;
  select path into p from public.event_photos where id = p_id;
  delete from public.event_photos where id = p_id;
  if p is not null then
    delete from storage.objects where bucket_id = 'eventpic' and name = p;
  end if;
end;
$$;

-- Rechte: nur diese Funktionen sind für die App erreichbar
revoke all on function public.ep_delete_own_photo(uuid, text)         from public;
revoke all on function public.ep_admin_list(text, text)               from public;
revoke all on function public.ep_admin_set_hidden(text, uuid, boolean) from public;
revoke all on function public.ep_admin_delete(text, uuid)             from public;
grant execute on function public.ep_delete_own_photo(uuid, text)          to anon;
grant execute on function public.ep_admin_list(text, text)                to anon;
grant execute on function public.ep_admin_set_hidden(text, uuid, boolean) to anon;
grant execute on function public.ep_admin_delete(text, uuid)              to anon;

-- ---------------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('eventpic', 'eventpic', true)
on conflict (id) do update set public = true;

drop policy if exists "eventpic lesen" on storage.objects;
create policy "eventpic lesen"
  on storage.objects for select
  using (bucket_id = 'eventpic');

drop policy if exists "eventpic hochladen" on storage.objects;
create policy "eventpic hochladen"
  on storage.objects for insert to anon
  with check (bucket_id = 'eventpic');

-- ---------------------------------------------------------------------------
-- 6. Nach dem Fest: aufräumen (bewusst manuell)
-- ---------------------------------------------------------------------------
-- Erst die Fotos herunterladen (Admin-Bereich → "Alle Fotos als ZIP"), dann:
--
--   delete from storage.objects where bucket_id = 'eventpic';
--   delete from public.event_photos where event_id = 'thomas60-2026';
--
-- Oder das gesamte Supabase-Projekt löschen.
