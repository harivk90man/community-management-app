-- ============================================================
-- Villa Association Management App — Database Schema
-- Run this in the Supabase SQL editor to initialise the schema.
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- Tables
-- ============================================================

create table if not exists villas (
  id              uuid primary key default gen_random_uuid(),
  villa_number    text not null,
  owner_name      text not null,
  email           text,
  phone           text,
  is_board_member boolean not null default false,
  board_role      text,
  is_active       boolean not null default true,
  is_rented       boolean not null default false,
  tenant_name     text,
  tenant_phone    text,
  created_at      timestamptz not null default now()
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  villa_id      uuid not null references villas (id) on delete cascade,
  amount        numeric not null,
  mode          text not null,
  billing_month int not null check (billing_month between 1 and 12),
  billing_year  int not null,
  paid_on       date not null,
  remarks       text,
  recorded_by   text,
  created_at    timestamptz not null default now()
);

create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  amount       numeric not null,
  category     text,
  expense_date date not null,
  added_by     text,
  created_at   timestamptz not null default now()
);

create table if not exists dues_config (
  id               uuid primary key default gen_random_uuid(),
  monthly_amount   numeric not null,
  effective_from   date not null,
  set_by           text,
  created_at       timestamptz not null default now()
);

create table if not exists complaints (
  id             uuid primary key default gen_random_uuid(),
  villa_id       uuid not null references villas (id) on delete cascade,
  type           text not null default 'complaint',
  title          text not null,
  description    text,
  status         text not null default 'Pending',
  priority       text not null default 'Medium',
  category       text,
  resolved_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  audience    text not null default 'All',
  is_pinned   boolean not null default false,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists visitors (
  id           uuid primary key default gen_random_uuid(),
  villa_id     uuid not null references villas (id) on delete cascade,
  visitor_name text not null,
  purpose      text,
  checked_in   timestamptz not null default now(),
  checked_out  timestamptz,
  approved_by  text
);

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  file_url    text not null,
  category    text,
  uploaded_by text,
  created_at  timestamptz not null default now()
);

create table if not exists polls (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  options     jsonb not null,
  closes_at   timestamptz,
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists poll_votes (
  id              uuid primary key default gen_random_uuid(),
  poll_id         uuid not null references polls (id) on delete cascade,
  villa_id        uuid not null references villas (id) on delete cascade,
  selected_option text not null,
  voted_at        timestamptz not null default now(),
  unique (poll_id, villa_id)
);

create table if not exists vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text,
  phone      text,
  email      text,
  rating     numeric check (rating between 0 and 5),
  added_by   text,
  created_at timestamptz not null default now()
);

create table if not exists emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  phone         text not null,
  category      text,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- Auto-update updated_at on complaints
-- ============================================================

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger complaints_updated_at
  before update on complaints
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table villas             enable row level security;
alter table payments           enable row level security;
alter table expenses           enable row level security;
alter table dues_config        enable row level security;
alter table complaints         enable row level security;
alter table announcements      enable row level security;
alter table visitors           enable row level security;
alter table documents          enable row level security;
alter table polls              enable row level security;
alter table poll_votes         enable row level security;
alter table vendors            enable row level security;
alter table emergency_contacts enable row level security;

-- ============================================================
-- RLS Policies
-- Placeholder policies — tighten these once auth is wired up.
-- Currently allows all operations for authenticated users.
-- ============================================================

-- villas
create policy "authenticated users can read villas"
  on villas for select to authenticated using (true);
create policy "authenticated users can insert villas"
  on villas for insert to authenticated with check (true);
create policy "authenticated users can update villas"
  on villas for update to authenticated using (true);
create policy "authenticated users can delete villas"
  on villas for delete to authenticated using (true);

-- payments
create policy "authenticated users can read payments"
  on payments for select to authenticated using (true);
create policy "authenticated users can insert payments"
  on payments for insert to authenticated with check (true);
create policy "authenticated users can update payments"
  on payments for update to authenticated using (true);
create policy "authenticated users can delete payments"
  on payments for delete to authenticated using (true);

-- expenses
create policy "authenticated users can read expenses"
  on expenses for select to authenticated using (true);
create policy "authenticated users can insert expenses"
  on expenses for insert to authenticated with check (true);
create policy "authenticated users can update expenses"
  on expenses for update to authenticated using (true);
create policy "authenticated users can delete expenses"
  on expenses for delete to authenticated using (true);

-- dues_config
create policy "authenticated users can read dues_config"
  on dues_config for select to authenticated using (true);
create policy "authenticated users can insert dues_config"
  on dues_config for insert to authenticated with check (true);
create policy "authenticated users can update dues_config"
  on dues_config for update to authenticated using (true);
create policy "authenticated users can delete dues_config"
  on dues_config for delete to authenticated using (true);

-- complaints
create policy "authenticated users can read complaints"
  on complaints for select to authenticated using (true);
create policy "authenticated users can insert complaints"
  on complaints for insert to authenticated with check (true);
create policy "authenticated users can update complaints"
  on complaints for update to authenticated using (true);
create policy "authenticated users can delete complaints"
  on complaints for delete to authenticated using (true);

-- announcements
create policy "authenticated users can read announcements"
  on announcements for select to authenticated using (true);
create policy "authenticated users can insert announcements"
  on announcements for insert to authenticated with check (true);
create policy "authenticated users can update announcements"
  on announcements for update to authenticated using (true);
create policy "authenticated users can delete announcements"
  on announcements for delete to authenticated using (true);

-- visitors
create policy "authenticated users can read visitors"
  on visitors for select to authenticated using (true);
create policy "authenticated users can insert visitors"
  on visitors for insert to authenticated with check (true);
create policy "authenticated users can update visitors"
  on visitors for update to authenticated using (true);
create policy "authenticated users can delete visitors"
  on visitors for delete to authenticated using (true);

-- documents
create policy "authenticated users can read documents"
  on documents for select to authenticated using (true);
create policy "authenticated users can insert documents"
  on documents for insert to authenticated with check (true);
create policy "authenticated users can update documents"
  on documents for update to authenticated using (true);
create policy "authenticated users can delete documents"
  on documents for delete to authenticated using (true);

-- polls
create policy "authenticated users can read polls"
  on polls for select to authenticated using (true);
create policy "authenticated users can insert polls"
  on polls for insert to authenticated with check (true);
create policy "authenticated users can update polls"
  on polls for update to authenticated using (true);
create policy "authenticated users can delete polls"
  on polls for delete to authenticated using (true);

-- poll_votes
create policy "authenticated users can read poll_votes"
  on poll_votes for select to authenticated using (true);
create policy "authenticated users can insert poll_votes"
  on poll_votes for insert to authenticated with check (true);
create policy "authenticated users can update poll_votes"
  on poll_votes for update to authenticated using (true);
create policy "authenticated users can delete poll_votes"
  on poll_votes for delete to authenticated using (true);

-- vendors
create policy "authenticated users can read vendors"
  on vendors for select to authenticated using (true);
create policy "authenticated users can insert vendors"
  on vendors for insert to authenticated with check (true);
create policy "authenticated users can update vendors"
  on vendors for update to authenticated using (true);
create policy "authenticated users can delete vendors"
  on vendors for delete to authenticated using (true);

-- emergency_contacts
create policy "authenticated users can read emergency_contacts"
  on emergency_contacts for select to authenticated using (true);
create policy "authenticated users can insert emergency_contacts"
  on emergency_contacts for insert to authenticated with check (true);
create policy "authenticated users can update emergency_contacts"
  on emergency_contacts for update to authenticated using (true);
create policy "authenticated users can delete emergency_contacts"
  on emergency_contacts for delete to authenticated using (true);
