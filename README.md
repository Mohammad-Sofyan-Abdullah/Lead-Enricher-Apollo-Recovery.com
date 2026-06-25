# Rehab Leads Pipeline

## What it does

Paste rehabilitation center names and URLs → search Apollo.io for decision-makers → enrich lead contact details → export CSV or XLSX. Applies a USA-only filter and deduplicates by Apollo ID so no person ever appears twice.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js 14 App                      │
│  /batches/new → /batches/[id] → /settings               │
└───────────────────────┬─────────────────────────────────┘
                        │ API Routes
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌────────────┐ ┌────────────────┐
│   Cleaner    │ │   Apollo   │ │   Exporter     │
│  (packages/) │ │ (packages/)│ │  (packages/)   │
└──────────────┘ └─────┬──────┘ └────────────────┘
                       │
                ┌──────▼──────┐
                │  Supabase   │
                │  (Postgres) │
                └─────────────┘
        ┌───────────────────────┐
        │   @pipeline/types     │
        │  (shared interfaces)  │
        └───────────────────────┘
```

**Packages:**
- `@pipeline/types` — canonical TypeScript interfaces shared across all packages
- `@rehab-leads/cleaner` — parses raw input, strips tracking params, applies skip rules
- `@rehab-leads/apollo` — Apollo.io API client (domain search, name search, bulk enrich)
- `@rehab-leads/exporter` — CSV and XLSX generation via papaparse and ExcelJS

## Setup

**1. Clone the repo**
```bash
git clone <repo-url>
cd rehab-leads-pipeline
```

**2. Install dependencies**
```bash
pnpm install
```

**3. Set up environment variables**
```bash
cp .env.local.example apps/web/.env.local
```
Edit `apps/web/.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APOLLO_API_KEY=your-apollo-api-key
```

**4. Run Supabase migration**

Go to your Supabase project → SQL Editor, paste and run:
```
supabase/migrations/001_initial.sql
```
If upgrading an existing database, also run:
```
supabase/migrations/003_add_missing_columns.sql
```

**5. Start the dev server**
```bash
pnpm dev
```
App runs at `http://localhost:3000`.

**6. Run the seed script (optional)**
```bash
pnpm seed          # create batch, enrich, export CSV
pnpm seed:clean    # same, then delete the test batch
```

## How to use

1. Go to `http://localhost:3000`
2. Click **New Batch**
3. Paste centers in tab-separated format:
   ```
   Center Name [TAB] Website [TAB] Source Page URL
   ```
4. Click **Preview & Clean** — review the cleaned list and skip summary
5. Click **Run Enrichment** — Apollo is queried and leads are saved
6. Download **CSV** or **XLSX** from the batch detail page

## Skip rules

Centers are automatically skipped (marked, not deleted) when their domain matches:

| Rule | Condition |
|------|-----------|
| iubenda placeholder | domain is `iubenda.com` |
| CTC Programs | domain is `ctcprograms.com` |
| ActiveHosted portal | domain is `activehosted.com` or subdomain |
| International TLD | ends with `.co.uk`, `.com.au`, `.in`, etc. |
| Known intl center | domain is in the hardcoded international set |
| Government/county | domain ends with `.gov` |
| Directory portal | `samhsa.gov`, `findtreatment.gov`, `psychology.com` |
| Listing URL | URL belongs to `recovery.com`, `rehabpath.com`, etc. |
| Invalid URL | cannot be parsed as a valid URL |

Skipped centers appear in the batch detail collapsible section and are included in the skip-reason summary of the XLSX export.

## Dedup rules

- **Apollo ID dedup**: the same person (Apollo ID) never appears twice in the leads table, even across different batches. `saveLead` checks before every insert and returns `"duplicate"` without writing.
- **Domain dedup**: multiple centers sharing the same root domain are grouped — one lead covers all of them.
- **Non-US filter**: leads whose Apollo `country` is not `"United States"` are discarded at the enrichment stage and counted in the `discarded` stat.

## Exporting

Both CSV and XLSX include these columns:

| Column | Notes |
|--------|-------|
| Center Name | matched center name from input |
| Website | cleaned center website |
| Source Page | recovery.com / rehabpath.com listing URL |
| Name | full name from Apollo |
| Email | empty string if not available |
| LinkedIn URL | profile URL |
| Title | job title |
| Organization | company name from Apollo |
| Email Status | `verified`, `likely to engage`, etc. |
| Source Method | `domain_search` or `name_search` |
| Country | always `United States` for saved leads |

XLSX additionally uses: bold navy header row, alternating row fill, frozen header, hyperlinked LinkedIn URLs, auto-fitted column widths.

## Project structure

```
rehab-leads-pipeline/
├── apps/
│   └── web/                    # Next.js 14 app
│       ├── app/
│       │   ├── api/batches/    # batch CRUD + enrich + export
│       │   ├── api/settings/   # connection test endpoints
│       │   ├── batches/        # new batch wizard + detail page
│       │   └── settings/       # settings page
│       ├── components/         # shared React components
│       └── lib/                # db.ts, supabase.ts, utils
├── packages/
│   ├── types/                  # @pipeline/types — shared interfaces
│   ├── apollo/                 # @rehab-leads/apollo — Apollo API client
│   ├── cleaner/                # @rehab-leads/cleaner — input cleaning
│   └── exporter/               # @rehab-leads/exporter — CSV/XLSX export
├── scripts/
│   ├── seed.ts                 # end-to-end test script
│   └── sample_centers.csv      # 10 sample centers for seeding
├── supabase/migrations/        # SQL migration files
└── db/                         # duplicate migration copies
```
