-- ============================================================
-- 001_initial.sql
-- Creates core tables for the rehab leads pipeline
-- ============================================================

create table centers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  website     text,
  domain      text,
  raw_url     text,
  status      text        not null default 'pending',  -- pending | skipped | enriched | not_found
  skip_reason text,
  batch_id    text,
  created_at  timestamptz not null default now()
);

create table leads (
  id           uuid        primary key default gen_random_uuid(),
  apollo_id    text        unique not null,
  center_id    uuid        references centers(id),
  center_name  text,
  website      text,
  full_name    text        not null,
  email        text,
  linkedin_url text,
  title        text,
  organization text,
  email_status text,
  created_at   timestamptz not null default now()
);

create table batches (
  id             text        primary key,
  label          text,
  total_centers  int         not null default 0,
  enriched       int         not null default 0,
  not_found      int         not null default 0,
  skipped        int         not null default 0,
  created_at     timestamptz not null default now()
);

create unique index leads_apollo_id_idx on leads(apollo_id);
create        index centers_batch_id_idx on centers(batch_id);
create        index centers_status_idx   on centers(status);

-- ============================================================
-- Row Level Security
-- Service role bypasses RLS automatically (uses service_role key).
-- Anon/authenticated users have no access.
-- ============================================================

alter table centers enable row level security;
alter table leads   enable row level security;
alter table batches enable row level security;

-- No policies for anon or authenticated — service role has full access implicitly.
-- If you add an authenticated role later, add policies here.
