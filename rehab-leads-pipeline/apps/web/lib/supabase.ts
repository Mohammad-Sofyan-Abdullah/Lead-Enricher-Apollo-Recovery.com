import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
}
if (!supabaseServiceKey) {
  throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Table name constants — all tables use the leadenricher_ prefix
export const TABLES = {
  centers: "leadenricher_centers",
  leads: "leadenricher_leads",
  batches: "leadenricher_batches",
} as const;

export type CenterStatus = "pending" | "skipped" | "enriched" | "not_found";

export interface Center {
  id: string;
  name: string;
  website: string | null;
  source_page: string | null;
  domain: string | null;
  no_website: boolean;
  raw_url: string | null;
  status: CenterStatus;
  skip_reason: string | null;
  source_method: "domain_search" | "name_search";
  batch_id: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  apollo_id: string;
  center_id: string | null;
  center_name: string | null;
  website: string | null;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  title: string | null;
  organization: string | null;
  email_status: string | null;
  country: string | null;
  source_method: "domain_search" | "name_search";
  created_at: string;
}

export interface Batch {
  id: string;
  label: string | null;
  total_centers: number;
  enriched: number;
  not_found: number;
  skipped: number;
  discarded: number;
  created_at: string;
}
