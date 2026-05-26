-- ============================================================
-- AMBAC Materials Task Manager — Supabase Schema
-- Paste this entire file into Supabase SQL Editor and click Run
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Workers ──────────────────────────────────────────────────
create table if not exists workers (
  id          text primary key,
  name        text not null,
  role        text not null default 'worker',
  position    text not null default 'Worker',
  avatar      text,
  pin         text not null default '0000',
  created_at  timestamptz default now()
);

-- ── Lists ────────────────────────────────────────────────────
create table if not exists lists (
  id              text primary key,
  title           text not null,
  due_time        text default '-',
  color           text default '#0D2240',
  is_rollover     boolean default false,
  created_by      text,
  assigned_to     text[] default '{}',
  schedule_mode   text default 'always',
  schedule_days   int[] default '{}',
  schedule_date   text,
  created_at      timestamptz default now()
);

-- ── Tasks ────────────────────────────────────────────────────
create table if not exists tasks (
  id                text primary key,
  list_id           text not null references lists(id) on delete cascade,
  text              text not null,
  priority          text default 'none',
  task_assignees    text[] default '{}',
  schedule_mode     text default 'always',
  days              int[] default '{}',
  start_date        text,
  done_by           text,
  done_at           timestamptz,
  note              text,
  note_by           text,
  note_at           timestamptz,
  original_due_date text,
  from_list         text,
  sort_order        int default 0,
  created_at        timestamptz default now()
);

-- ── Activity Log ─────────────────────────────────────────────
create table if not exists activity (
  id          text primary key,
  msg         text not null,
  user_id     text,
  created_at  timestamptz default now()
);

-- ── Notifications ─────────────────────────────────────────────
create table if not exists notifications (
  id          text primary key,
  user_id     text not null,
  title       text not null,
  body        text,
  list_id     text,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

-- ── Rollover tracking ─────────────────────────────────────────
create table if not exists app_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

-- ── Enable Row Level Security (open read/write for all — lock down later) ──
alter table workers       enable row level security;
alter table lists         enable row level security;
alter table tasks         enable row level security;
alter table activity      enable row level security;
alter table notifications enable row level security;
alter table app_state     enable row level security;

-- Allow all operations for anon key (your app uses this)
create policy "Allow all for anon" on workers       for all using (true) with check (true);
create policy "Allow all for anon" on lists         for all using (true) with check (true);
create policy "Allow all for anon" on tasks         for all using (true) with check (true);
create policy "Allow all for anon" on activity      for all using (true) with check (true);
create policy "Allow all for anon" on notifications for all using (true) with check (true);
create policy "Allow all for anon" on app_state     for all using (true) with check (true);

-- ── Enable Realtime (so all devices get live updates) ─────────
-- Run these after the above:
alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;

-- ── Seed workers (delete and re-insert if needed) ─────────────
insert into workers (id, name, role, position, avatar, pin) values
  ('w1', 'Alex R.',   'worker', 'Worker', 'AR', '1111'),
  ('w2', 'Jordan M.', 'worker', 'Lead',   'JM', '2222'),
  ('w3', 'Casey T.',  'worker', 'Worker', 'CT', '3333'),
  ('w4', 'Sam K.',    'worker', 'Worker', 'SK', '4444')
on conflict (id) do nothing;

-- Done! Your schema is ready.
-- Next: go to Project Settings → API and copy your URL and anon key.
