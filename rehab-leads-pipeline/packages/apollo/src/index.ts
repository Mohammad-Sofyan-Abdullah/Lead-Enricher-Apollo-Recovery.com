import type { SearchResult, EnrichedLead } from '@pipeline/types'

const SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search'
const ENRICH_URL = 'https://api.apollo.io/v1/people/bulk_match'
const BATCH_SIZE_SEARCH = 13
const BATCH_SIZE_ENRICH = 10

// Apollo allows 200 requests/minute (x-rate-limit-minute). Running 5 calls in
// flight at ~2s each lands around 145/min, and MIN_INTERVAL_MS caps the start
// rate at 150/min in case Apollo answers faster than usual.
const CONCURRENCY = 5
const MIN_INTERVAL_MS = 400
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

function getHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'accept': 'application/json',
    'x-api-key': process.env.APOLLO_API_KEY ?? '',
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Serialises request *start* times so bursts can never exceed Apollo's per-minute
// budget, regardless of how fast responses come back.

let nextSlot = 0

async function takeRateLimitSlot(): Promise<void> {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_INTERVAL_MS
  if (slot > now) await sleep(slot - now)
}

/** Runs `fn` over `items` with at most CONCURRENCY in flight, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await fn(items[index], index)
      }
    }
  )

  await Promise.all(workers)
  return results
}

/** Fetch with rate limiting, retrying 429s and 5xx with exponential backoff. */
async function apolloFetch(
  url: string,
  body: unknown,
  label: string
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await takeRateLimitSlot()

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error(`[Apollo] ${label} fetch threw (attempt ${attempt + 1}):`, err)
      if (attempt === MAX_RETRIES) return null
      await sleep(BASE_BACKOFF_MS * 2 ** attempt)
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt
      console.warn(`[Apollo] ${label} got ${res.status}, retrying in ${waitMs}ms`)
      await sleep(waitMs)
      continue
    }

    return res
  }

  return null
}

/** Parses an Apollo response into JSON, logging and returning null on failure. */
async function readJson(res: Response | null, label: string): Promise<any | null> {
  if (!res) {
    console.error(`[Apollo] ${label} gave up after ${MAX_RETRIES + 1} attempts`)
    return null
  }
  if (!res.ok) {
    console.error(`[Apollo] ${label} error ${res.status}:`, await res.text())
    return null
  }
  return res.json()
}

const TITLE_RANK: [string, number][] = [
  ['founding ceo', 1], ['co-ceo', 1], ['group ceo', 1],
  ['interim ceo', 1], ['chief executive officer', 1], ['ceo', 1],
  ['president', 2],
  ['co-founder', 3], ['founder', 3],
  ['co-owner', 4], ['owner', 4],
  ['executive director', 5],
  ['chief operating officer', 6], ['coo', 6],
  ['managing director', 7],
  ['administrator', 8],
  ['vice president', 9], [' vp ', 9],
  ['director', 10],
]

function rankTitle(title: string): number {
  const t = (title ?? '').toLowerCase()
  for (const [kw, rank] of TITLE_RANK) {
    if (t.includes(kw)) return rank
  }
  return 99
}

const PERSON_TITLES = [
  'owner', 'ceo', 'chief executive officer',
  'executive director', 'president', 'founder',
  'chief operating officer', 'managing director', 'administrator',
]
const PERSON_SENIORITIES = ['owner', 'c_suite', 'vp', 'director']

export async function searchByDomains(
  domains: string[]
): Promise<SearchResult[]> {
  // Build every batch up front so the requests can overlap.
  const batches: string[][] = []
  for (let i = 0; i < domains.length; i += BATCH_SIZE_SEARCH) {
    const batch = domains
      .slice(i, i + BATCH_SIZE_SEARCH)
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    if (batch.length > 0) batches.push(batch)
  }

  console.log(`[Apollo Search] ${domains.length} domains in ${batches.length} batches`)

  const payloads = await mapWithConcurrency(batches, async (batch, i) => {
    const res = await apolloFetch(SEARCH_URL, {
      q_organization_domains_list: batch,
      person_seniorities: PERSON_SENIORITIES,
      person_titles: PERSON_TITLES,
      person_locations: ['United States'],
      per_page: 25,
      page: 1,
    }, `search batch ${i + 1}`)
    return readJson(res, `search batch ${i + 1}`)
  })

  // Results are folded in batch order so dedup stays deterministic.
  const results: SearchResult[] = []
  const seenApolloIds = new Set<string>()

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const people: any[] = payloads[b]?.people ?? []
    if (!people.length) continue

    const bestPerDomain = new Map<string, any>()

    for (const person of people) {
      const orgName = (person.organization?.name ?? '').toLowerCase()

      let matchedDomain = ''
      for (const domain of batch) {
        const domainRoot = domain.split('.')[0].toLowerCase()
        if (
          orgName.includes(domainRoot) ||
          domainRoot.includes(orgName.split(' ')[0]) ||
          (person.organization?.website_url ?? '').includes(domain)
        ) {
          matchedDomain = domain
          break
        }
      }

      // Fallback: assign to first domain in the batch
      if (!matchedDomain && batch.length > 0) {
        matchedDomain = batch[0]
      }

      if (!matchedDomain) continue

      const existing = bestPerDomain.get(matchedDomain)
      if (!existing || rankTitle(person.title) < rankTitle(existing.title ?? '')) {
        bestPerDomain.set(matchedDomain, person)
      }
    }

    for (const [domain, person] of bestPerDomain.entries()) {
      if (seenApolloIds.has(person.id)) continue
      seenApolloIds.add(person.id)

      results.push({
        apolloId: person.id as string,
        domain,
        firstName: (person.first_name ?? '') as string,
        lastNameMasked: (person.last_name_obfuscated ?? '') as string,
        title: (person.title ?? '') as string,
        org: (person.organization?.name ?? '') as string,
        hasEmail: (person.has_email ?? false) as boolean,
        sourceMethod: 'domain_search',
      })
    }
  }

  console.log(`[Apollo Search] Done — ${results.length} leads total`)
  return results
}

/** Picks the best-ranked person whose org name matches the centre name. */
function pickByName(payload: any, centerName: string): SearchResult | null {
  const people: any[] = payload?.people ?? []
  const needle = centerName.toLowerCase()

  const matched = people.filter((p: any) => {
    const orgName = (p.organization?.name ?? '').toLowerCase()
    return orgName.includes(needle) || needle.includes(orgName)
  })

  if (!matched.length) return null

  const best = matched.reduce((a: any, b: any) =>
    rankTitle(a.title) <= rankTitle(b.title) ? a : b
  )

  return {
    apolloId: best.id as string,
    domain: best.organization?.primary_domain ?? '',
    firstName: (best.first_name ?? '') as string,
    lastNameMasked: (best.last_name_obfuscated ?? '') as string,
    title: (best.title ?? '') as string,
    org: (best.organization?.name ?? '') as string,
    hasEmail: (best.has_email ?? false) as boolean,
    sourceMethod: 'name_search',
  }
}

function nameSearchBody(centerName: string) {
  return {
    q_keywords: centerName,
    person_seniorities: PERSON_SENIORITIES,
    person_titles: PERSON_TITLES,
    person_locations: ['United States'],
    per_page: 25,
    page: 1,
  }
}

export async function searchByName(
  centerName: string
): Promise<SearchResult | null> {
  const res = await apolloFetch(SEARCH_URL, nameSearchBody(centerName), `name search "${centerName}"`)
  const payload = await readJson(res, `name search "${centerName}"`)
  return payload ? pickByName(payload, centerName) : null
}

/** Name-searches many centres concurrently. Returns results aligned with `centerNames`. */
export async function searchByNames(
  centerNames: string[]
): Promise<(SearchResult | null)[]> {
  console.log(`[Apollo Search] ${centerNames.length} name searches`)

  return mapWithConcurrency(centerNames, async (centerName, i) => {
    const res = await apolloFetch(SEARCH_URL, nameSearchBody(centerName), `name search ${i + 1}`)
    const payload = await readJson(res, `name search ${i + 1}`)
    return payload ? pickByName(payload, centerName) : null
  })
}

export async function enrichBulk(
  leads: SearchResult[]
): Promise<EnrichedLead[]> {
  const batches: SearchResult[][] = []
  for (let i = 0; i < leads.length; i += BATCH_SIZE_ENRICH) {
    batches.push(leads.slice(i, i + BATCH_SIZE_ENRICH))
  }

  console.log(`[Apollo Enrich] ${leads.length} leads in ${batches.length} batches`)

  const payloads = await mapWithConcurrency(batches, async (batch, i) => {
    const res = await apolloFetch(ENRICH_URL, {
      details: batch.map(l => ({ id: l.apolloId })),
      reveal_personal_emails: true,
    }, `enrich batch ${i + 1}`)
    return readJson(res, `enrich batch ${i + 1}`)
  })

  const results: EnrichedLead[] = []

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const matches: any[] = payloads[b]?.matches ?? []

    for (const match of matches) {
      const country = (match.country ?? '') as string
      if (country.toLowerCase() !== 'united states') {
        console.log(`[Apollo Enrich] Discarded ${match.name} — country: ${country || 'unknown'}`)
        continue
      }

      const original = batch.find(l => l.apolloId === match.id)
      results.push({
        apolloId: match.id as string,
        fullName: (match.name ?? '') as string,
        email: (match.email ?? null) as string | null,
        emailStatus: (match.email_status ?? '') as string,
        linkedinUrl: (match.linkedin_url ?? null) as string | null,
        title: (match.title ?? original?.title ?? '') as string,
        org: (match.organization?.name ?? original?.org ?? '') as string,
        country,
        sourceMethod: original?.sourceMethod ?? 'domain_search',
      })
    }
  }

  console.log(`[Apollo Enrich] Done — ${results.length} enriched leads`)
  return results
}
