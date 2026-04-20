-- ============================================================
-- Migration: Add villa_users table
-- Run this in the Supabase SQL editor on existing databases.
-- It creates the table and migrates existing villa contact data.
-- ============================================================

-- 1. Create the villa_users table
create table if not exists villa_users (
  id         uuid primary key default gen_random_uuid(),
  villa_id   uuid not null references villas (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Migrate existing villa owner data into villa_users
insert into villa_users (villa_id, name, email, phone, is_primary)
select id, owner_name, email, phone, true
from villas
where owner_name is not null
on conflict do nothing;

-- 3. Enable RLS
alter table villa_users enable row level security;

-- 4. RLS policies
-- Allow anon reads so signup can verify email/phone before authentication
create policy "anon users can read villa_users"
  on villa_users for select to anon using (true);
create policy "authenticated users can read villa_users"
  on villa_users for select to authenticated using (true);
create policy "authenticated users can insert villa_users"
  on villa_users for insert to authenticated with check (true);
create policy "authenticated users can update villa_users"
  on villa_users for update to authenticated using (true);
create policy "authenticated users can delete villa_users"
  on villa_users for delete to authenticated using (true);
