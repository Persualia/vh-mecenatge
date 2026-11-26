import "server-only";
import type { CampaignSpendRepository } from "@/tracking/application/ports/campaign-spend-repository";
import type { DateRange } from "@/tracking/domain/dataset";
import type { CampaignSpend } from "@/tracking/domain/impulsa";
import type { GoogleOAuth } from "./google-oauth";

export interface GoogleAdsSettings {
  /** Ten digits; dashes are accepted. */
  customerId: string;
  developerToken: string;
  /** Only when the account is reached through a manager account (MCC). */
  loginCustomerId?: string;
  /** Google retires each version about a year after release. */
  apiVersion: string;
}

interface StreamBatch {
  results?: { campaign?: { name?: string }; customer?: { currencyCode?: string }; metrics?: { costMicros?: string } }[];
}

const digits = (id: string) => id.replace(/\D/g, "");

/**
 * Spend per campaign from the Google Ads API (GAQL over `searchStream`). Amounts come in
 * micros of the account's currency. The result is kept for a while, like Meta's.
 */
export class GoogleAdsSpendRepository implements CampaignSpendRepository {
  private readonly cache = new Map<string, { expires: number; value: Promise<{ currency: string; campaigns: CampaignSpend[] }> }>();

  constructor(
    private readonly oauth: GoogleOAuth,
    private readonly settings: GoogleAdsSettings,
    private readonly ttlMs = 30 * 60_000,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  spendByCampaign(range: DateRange): Promise<{ currency: string; campaigns: CampaignSpend[] }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.since) || !/^\d{4}-\d{2}-\d{2}$/.test(range.until)) throw new Error("Període no vàlid per a Google Ads.");
    const key = `${range.since}|${range.until}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > this.now()) return hit.value;

    const value = this.read(range);
    this.cache.set(key, { expires: this.now() + this.ttlMs, value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private async read(range: DateRange) {
    const query =
      "SELECT customer.currency_code, campaign.name, metrics.cost_micros FROM campaign " +
      `WHERE segments.date BETWEEN '${range.since}' AND '${range.until}' AND metrics.cost_micros > 0`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.oauth.accessToken()}`,
      "developer-token": this.settings.developerToken,
      "Content-Type": "application/json",
    };
    if (this.settings.loginCustomerId) headers["login-customer-id"] = digits(this.settings.loginCustomerId);

    const url = `https://googleads.googleapis.com/${this.settings.apiVersion}/customers/${digits(this.settings.customerId)}/googleAds:searchStream`;
    const response = await this.fetchImpl(url, { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store" });
    const body = (await response.json().catch(() => null)) as StreamBatch[] | { error?: { message?: string } } | null;
    if (!response.ok || !Array.isArray(body)) {
      const message = body && !Array.isArray(body) ? body.error?.message : response.statusText;
      throw new Error(`Google Ads ha respost ${response.status}: ${message}`);
    }
    return toCampaignSpend(body);
  }
}

/** One row per campaign and segment: summed by campaign, micros to units. */
export function toCampaignSpend(batches: StreamBatch[]): { currency: string; campaigns: CampaignSpend[] } {
  const byName = new Map<string, number>();
  let currency = "";
  for (const row of batches.flatMap((b) => b.results ?? [])) {
    currency ||= row.customer?.currencyCode ?? "";
    const name = row.campaign?.name ?? "";
    byName.set(name, (byName.get(name) ?? 0) + Number(row.metrics?.costMicros ?? 0));
  }
  return { currency, campaigns: [...byName].map(([name, micros]) => ({ name, spend: Math.round(micros / 10_000) / 100 })) };
}
