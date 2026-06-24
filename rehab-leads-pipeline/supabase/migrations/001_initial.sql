-- ============================================================
-- 001_initial.sql  (mirrors db/001_initial.sql)
-- Definitive schema — run once on a fresh database.
-- ============================================================

create table leadenricher_centers (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  website       text,
  source_page   text,
  domain        text,
  no_website    boolean     not null default false,
  raw_url       text,
  status        text        not null default 'pending',
  skip_reason   text,
  source_method text        not null default 'domain_search',
  batch_id      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table leadenricher_leads (
  id            uuid        primary key default gen_random_uuid(),
  apollo_id     text        unique not null,
  center_id     uuid        references leadenricher_centers(id),
  center_name   text,
  website       text,
  source_page   text,
  full_name     text        not null,
  email         text,
  linkedin_url  text,
  title         text,
  organization  text,
  email_status  text,
  country       text,
  source_method text        not null default 'domain_search',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table leadenricher_batches (
  id             text        primary key,
  label          text,
  total_centers  int         not null default 0,
  enriched       int         not null default 0,
  not_found      int         not null default 0,
  skipped        int         not null default 0,
  discarded      int         not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index leadenricher_leads_apollo_id_idx   on leadenricher_leads(apollo_id);
create        index leadenricher_centers_batch_id_idx  on leadenricher_centers(batch_id);
create        index leadenricher_centers_status_idx    on leadenricher_centers(status);
create        index leads_center_id_idx                on leadenricher_leads(center_id);
create        index batches_created_at_idx             on leadenricher_batches(created_at desc);

alter table leadenricher_centers enable row level security;
alter table leadenricher_leads   enable row level security;
alter table leadenricher_batches enable row level security;
