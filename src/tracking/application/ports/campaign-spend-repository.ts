import type { DateRange } from "@/tracking/domain/dataset";
import type { CampaignSpend } from "@/tracking/domain/impulsa";
import type { FetchOptions } from "./fetch-options";

/**
 * Spend per campaign on an advertising platform over a period, in the account's currency.
 * Used for the platforms the board only needs a total from, such as Google Ads.
 */
export interface CampaignSpendRepository {
  spendByCampaign(range: DateRange, options?: FetchOptions): Promise<{ currency: string; campaigns: CampaignSpend[] }>;
}
