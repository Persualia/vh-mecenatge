import { describe, expect, it, vi } from "vitest";
import { sumCampaignSpend } from "@/tracking/domain/impulsa";
import { GoogleAdsSpendRepository, toCampaignSpend } from "./google-ads-spend-repository";
import { GoogleOAuth } from "./google-oauth";

vi.mock("server-only", () => ({}));

const RANGE = { since: "2025-11-27", until: "2026-11-26" };
const stream = [
  {
    results: [
      { customer: { currencyCode: "EUR" }, campaign: { name: "PER ImpulsaTalent PMax Sales v1" }, metrics: { costMicros: "1142270000" } },
      { customer: { currencyCode: "EUR" }, campaign: { name: "PER ImpulsaTalent DemandGen Sales v1" }, metrics: { costMicros: "941700000" } },
      { customer: { currencyCode: "EUR" }, campaign: { name: "PER SantJordi26 PMax Sales v1" }, metrics: { costMicros: "389000000" } },
    ],
  },
  { results: [{ customer: { currencyCode: "EUR" }, campaign: { name: "PER ImpulsaTalent Search Sales v1" }, metrics: { costMicros: "204410000" } }] },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const oauthWith = (fetchImpl: typeof fetch) => new GoogleOAuth("id", "secret", "refresh", fetchImpl);

describe("Google Ads spend", () => {
  it("turns micros into euros and sums every batch", () => {
    const { currency, campaigns } = toCampaignSpend(stream);
    expect(currency).toBe("EUR");
    expect(sumCampaignSpend(campaigns, (name) => name.includes("ImpulsaTalent"))).toBe(2288.38);
  });

  it("asks the account without dashes, with the developer token and the manager account when there is one", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2") ? json({ access_token: "at", expires_in: 3600 }) : json(stream),
    ) as unknown as typeof fetch;
    const repo = new GoogleAdsSpendRepository(oauthWith(fetchImpl), { customerId: "360-759-6474", developerToken: "dev", loginCustomerId: "111-222-3333", apiVersion: "v26" }, 60_000, fetchImpl);

    await repo.spendByCampaign(RANGE);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(url).toBe("https://googleads.googleapis.com/v26/customers/3607596474/googleAds:searchStream");
    expect(init.headers).toMatchObject({ Authorization: "Bearer at", "developer-token": "dev", "login-customer-id": "1112223333" });
    expect(JSON.parse(init.body).query).toContain("BETWEEN '2025-11-27' AND '2026-11-26'");
  });

  it("reads once per period while the cache lasts", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2") ? json({ access_token: "at", expires_in: 3600 }) : json(stream),
    ) as unknown as typeof fetch;
    const repo = new GoogleAdsSpendRepository(oauthWith(fetchImpl), { customerId: "3607596474", developerToken: "dev", apiVersion: "v26" }, 60_000, fetchImpl);
    await Promise.all([repo.spendByCampaign(RANGE), repo.spendByCampaign(RANGE)]);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("says what Google answered when it refuses", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2") ? json({ access_token: "at" }) : json({ error: { message: "The developer token is only approved for test accounts." } }, 403),
    ) as unknown as typeof fetch;
    const repo = new GoogleAdsSpendRepository(oauthWith(fetchImpl), { customerId: "3607596474", developerToken: "dev", apiVersion: "v26" }, 60_000, fetchImpl);
    await expect(repo.spendByCampaign(RANGE)).rejects.toThrow(/403: The developer token is only approved/);
  });

  it("explains a refresh token Google no longer accepts", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)) as unknown as typeof fetch;
    await expect(oauthWith(fetchImpl).accessToken()).rejects.toThrow(/expired or revoked/);
  });
});
