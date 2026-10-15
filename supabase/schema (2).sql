-- =====================================================
-- ChatApp - Supabase database schema (reference)
-- Exported from the live Supabase project (public schema)
-- =====================================================
-- This file documents the tables and Row Level Security (RLS)
-- policies used by the app. Column names and types come from
-- information_schema; policies come from pg_policies.
-- Primary keys, defaults and foreign keys are not part of that
-- export, so they are not listed here.
--
-- Not included yet: database functions (for example
-- is_blocked_between) and Storage bucket policies.
-- =====================================================

-- -----------------------------------------------------
-- profiles: one row per user
-- code = the user's personal 6-digit friend code
-- -----------------------------------------------------
create table if not exists public.profiles (
  id           uuid,
  name         text,
  code         text,
  avatar_path  text,
  created_at   timestamptz
);

alter table public.profiles enable row level security;

-- A user can see their own profile and the profiles of their contacts
create policy "Users can view self and contacts"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from contacts
      where contacts.owner_id = auth.uid()
        and contacts.contact_id = profiles.id
    )
  );

-- A user can update only their own profile
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------
-- contacts: friends list (owner -> contact)
-- -----------------------------------------------------
create table if not exists public.contacts (
  owner_id    uuid,
  contact_id  uuid,
  created_at  timestamptz
);

alter table public.contacts enable row level security;

create policy "Users can read their own contacts"
  on public.contacts for select
  to authenticated
  using (owner_id = auth.uid());

-- -----------------------------------------------------
-- chat_messages: text, voice, file and video messages
-- kind        = message type (text / voice / file / video ...)
-- delivered_at / read_at = delivery and read ticks
-- deleted_at / hidden_for = delete-for-everyone / delete-for-me
-- -----------------------------------------------------
create table if not exists public.chat_messages (
  id            bigint,
  sender_id     uuid,
  receiver_id   uuid,
  text          text,
  kind          text,
  file_path     text,
  file_name     text,
  file_size     bigint,
  mime_type     text,
  duration_ms   integer,
  created_at    timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  deleted_at    timestamptz,
  hidden_for    uuid[]
);

alter table public.chat_messages enable row level security;

-- Users read only messages they sent or received (and have not hidden)
create policy "Users can read own messages"
  on public.chat_messages for select
  to authenticated
  using (
    (sender_id = auth.uid() or receiver_id = auth.uid())
    and not (auth.uid() = any (hidden_for))
  );

-- Users can message only their own contacts, and not if blocked
-- (is_blocked_between is a database function)
create policy "Users can send messages to contacts"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from contacts c
      where c.owner_id = auth.uid()
        and c.contact_id = chat_messages.receiver_id
    )
    and not is_blocked_between(auth.uid(), receiver_id)
  );

-- -----------------------------------------------------
-- blocks: users blocked by another user
-- -----------------------------------------------------
create table if not exists public.blocks (
  blocker_id  uuid,
  blocked_id  uuid,
  created_at  timestamptz
);

alter table public.blocks enable row level security;

create policy "Users can view own blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

-- -----------------------------------------------------
-- code_attempts: log of friend-code attempts (rate limiting)
-- No client policies exported.
-- -----------------------------------------------------
create table if not exists public.code_attempts (
  id          bigint,
  user_id     uuid,
  created_at  timestamptz
);

-- -----------------------------------------------------
-- messages: legacy table from the first version of the app
-- (sender / receiver are text). No policies exported.
-- -----------------------------------------------------
create table if not exists public.messages (
  id          bigint,
  text        text,
  sender      text,
  receiver    text,
  created_at  timestamptz
);
