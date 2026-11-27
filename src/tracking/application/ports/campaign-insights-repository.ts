import type { DateRange, InsightsDataset } from "@/tracking/domain/dataset";
import type { FetchOptions } from "./fetch-options";

export type { FetchOptions } from "./fetch-options";

export interface CampaignInsightsRepository {
  fetchDaily(accountId: string, range: DateRange, options?: FetchOptions): Promise<InsightsDataset>;
}
