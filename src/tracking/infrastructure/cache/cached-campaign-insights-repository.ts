import type { CampaignInsightsRepository, FetchOptions } from "@/tracking/application/ports/campaign-insights-repository";
import type { DateRange, InsightsDataset } from "@/tracking/domain/dataset";

interface Entry {
  expires: number;
  value: Promise<InsightsDataset>;
}

/** Keeps each account's data in memory, so switching between accounts stays instant. */
export class CachedCampaignInsightsRepository implements CampaignInsightsRepository {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly source: CampaignInsightsRepository,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  fetchDaily(accountId: string, range: DateRange, options?: FetchOptions): Promise<InsightsDataset> {
    const key = `${accountId}|${range.since}|${range.until}`;
    const entry = this.entries.get(key);
    if (entry && entry.expires > this.now() && !options?.fresh) return entry.value;

    const value = this.source.fetchDaily(accountId, range, options);
    this.entries.set(key, { expires: this.now() + this.ttlMs, value });
    value.catch(() => this.entries.delete(key));
    return value;
  }
}
