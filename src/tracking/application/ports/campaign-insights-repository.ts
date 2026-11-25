import type { DateRange, InsightsDataset } from "@/tracking/domain/dataset";

export interface FetchOptions {
  /** Skip any cache and read the source again. */
  fresh?: boolean;
}

export interface CampaignInsightsRepository {
  fetchDaily(accountId: string, range: DateRange, options?: FetchOptions): Promise<InsightsDataset>;
}
