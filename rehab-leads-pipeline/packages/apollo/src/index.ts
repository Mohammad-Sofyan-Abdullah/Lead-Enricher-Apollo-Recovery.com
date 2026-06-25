import type { SearchResult, EnrichedLead } from '@pipeline/types'

const SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search'
const ENRICH_URL = 'https://api.apollo.io/v1/people/bulk_match'
const BATCH_SIZE_SEARCH = 13
const BATCH_SIZE_ENRICH = 10

function getHeaders(): Record<string, string> {
  const key = process.env.APOLLO_API_KEY ?? ''
  console.log('[Apollo] Using API key prefix:', key.slice(0, 8))
  return {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'accept': 'application/json',
    'x-api-key': key,
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

export async function searchByDomains(
  domains: string[]
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const seenApolloIds = new Set<string>()

  for (let i = 0; i < domains.length; i += BATCH_SIZE_SEARCH) {
    const batchNum = Math.floor(i / BATCH_SIZE_SEARCH) + 1
    const batch = domains
      .slice(i, i + BATCH_SIZE_SEARCH)
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)

    if (batch.length === 0) continue

    const body = {
      q_organization_domains_list: batch,
      person_seniorities: ['owner', 'c_suite', 'vp', 'director'],
      person_titles: [
        'owner', 'ceo', 'chief executive officer',
        'executive director', 'president', 'founder',
        'chief operating officer', 'managing director', 'administrator',
      ],
      person_locations: ['United States'],
      per_page: 25,
      page: 1,
    }

    console.log(`[Apollo Search] Batch ${batchNum} — domains:`, batch)

    let res: Response
    try {
      res = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error(`[Apollo Search] Batch ${batchNum} fetch threw:`, err)
      await sleep(500)
      continue
    }

    console.log(`[Apollo Search] Batch ${batchNum} status:`, res.status)

    if (!res.ok) {
      const txt = await res.text()
      console.error(`[Apollo Search] Batch ${batchNum} error body:`, txt)
      await sleep(500)
      continue
    }

    const data = await res.json()
    const people: any[] = data.people ?? []
    console.log(`[Apollo Search] Batch ${batchNum} returned ${people.length} people`)
    if (people.length > 0) {
      console.log('[Apollo] Sample person org:', JSON.stringify(people[0]?.organization))
      console.log('[Apollo] Sample person fields:', Object.keys(people[0] ?? {}))
    }

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

    await sleep(500)
  }

  console.log(`[Apollo Search] Done — ${results.length} leads total`)
  return results
}

export async function searchByName(
  centerName: string
): Promise<SearchResult | null> {
  console.log(`[Apollo Search] searchByName: "${centerName}"`)

  let res: Response
  try {
    res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        q_keywords: centerName,
        person_seniorities: ['owner', 'c_suite', 'vp', 'director'],
        person_titles: [
          'owner', 'ceo', 'chief executive officer',
          'executive director', 'president', 'founder',
          'chief operating officer', 'managing director', 'administrator',
        ],
        person_locations: ['United States'],
        per_page: 25,
        page: 1,
      }),
    })
  } catch (err) {
    console.error(`[Apollo Search] searchByName fetch threw:`, err)
    return null
  }

  console.log(`[Apollo Search] searchByName status:`, res.status)

  if (!res.ok) {
    const txt = await res.text()
    console.error(`[Apollo Search] searchByName error body:`, txt)
    return null
  }

  const data = await res.json()
  const people: any[] = data.people ?? []
  const needle = centerName.toLowerCase()

  const matched = people.filter((p: any) => {
    const orgName = (p.organization?.name ?? '').toLowerCase()
    return orgName.includes(needle) || needle.includes(orgName)
  })

  if (!matched.length) return null

  const best = matched.reduce((a: any, b: any) =>
    rankTitle(a.title) <= rankTitle(b.title) ? a : b
  )

  const domain = best.organization?.primary_domain ?? ''

  return {
    apolloId: best.id as string,
    domain,
    firstName: (best.first_name ?? '') as string,
    lastNameMasked: (best.last_name_obfuscated ?? '') as string,
    title: (best.title ?? '') as string,
    org: (best.organization?.name ?? '') as string,
    hasEmail: (best.has_email ?? false) as boolean,
    sourceMethod: 'name_search',
  }
}

export async function enrichBulk(
  leads: SearchResult[]
): Promise<EnrichedLead[]> {
  const results: EnrichedLead[] = []

  for (let i = 0; i < leads.length; i += BATCH_SIZE_ENRICH) {
    const batchNum = Math.floor(i / BATCH_SIZE_ENRICH) + 1
    const batch = leads.slice(i, i + BATCH_SIZE_ENRICH)

    const body = {
      details: batch.map(l => ({ id: l.apolloId })),
      reveal_personal_emails: true,
    }

    console.log(`[Apollo Enrich] Batch ${batchNum} — enriching ${batch.length} people`)

    let res: Response
    try {
      res = await fetch(ENRICH_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error(`[Apollo Enrich] Batch ${batchNum} fetch threw:`, err)
      await sleep(500)
      continue
    }

    console.log(`[Apollo Enrich] Batch ${batchNum} status:`, res.status)

    if (!res.ok) {
      const txt = await res.text()
      console.error(`[Apollo Enrich] Batch ${batchNum} error body:`, txt)
      await sleep(500)
      continue
    }

    const data = await res.json()
    const matches: any[] = data.matches ?? []
    console.log(`[Apollo Enrich] Batch ${batchNum} got ${matches.length} matches`)

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

    await sleep(500)
  }

  console.log(`[Apollo Enrich] Done — ${results.length} enriched leads`)
  return results
}
