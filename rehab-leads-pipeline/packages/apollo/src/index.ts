import { z } from "zod";

export const ApolloPersonSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  email_status: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  title: z.string().nullable(),
  organization: z
    .object({
      name: z.string().nullable(),
      website_url: z.string().nullable(),
    })
    .nullable(),
});

export type ApolloPerson = z.infer<typeof ApolloPersonSchema>;

export const ApolloSearchResponseSchema = z.object({
  people: z.array(ApolloPersonSchema),
  pagination: z.object({
    page: z.number(),
    per_page: z.number(),
    total_entries: z.number(),
    total_pages: z.number(),
  }),
});

export type ApolloSearchResponse = z.infer<typeof ApolloSearchResponseSchema>;

export interface SearchPeopleParams {
  organizationDomains: string[];
  titles?: string[];
  page?: number;
  perPage?: number;
}

export class ApolloClient {
  private readonly baseUrl = "https://api.apollo.io/v1";

  constructor(private readonly apiKey: string) {}

  async searchPeople(params: SearchPeopleParams): Promise<ApolloSearchResponse> {
    const body = {
      api_key: this.apiKey,
      q_organization_domains: params.organizationDomains.join("\n"),
      person_titles: params.titles ?? [
        "CEO",
        "Chief Executive Officer",
        "Owner",
        "Founder",
        "President",
        "Executive Director",
        "Director",
        "Administrator",
      ],
      page: params.page ?? 1,
      per_page: params.perPage ?? 10,
      contact_email_status: ["verified", "likely to engage"],
    };

    const res = await fetch(`${this.baseUrl}/mixed_people/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    return ApolloSearchResponseSchema.parse(json);
  }

  async enrichOrganization(domain: string) {
    const res = await fetch(
      `${this.baseUrl}/organizations/enrich?api_key=${this.apiKey}&domain=${domain}`,
      { headers: { "Cache-Control": "no-cache" } }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo enrich error ${res.status}: ${text}`);
    }

    return res.json();
  }
}
