/** Result an advertiser optimises for. Each key has its copy in `result-types.ts`. */
export type ResultKey =
  | "lead"
  | "purchase"
  | "complete_registration"
  | "landing_page_view"
  | "link_click"
  | "post_engagement"
  | "thruplay";

export interface Campaign {
  id: string;
  accountId: string;
  name: string;
  objective: string;
  /** Delivery status as reported by the ad platform (ACTIVE, PAUSED, …). */
  status: string;
}

export interface DailyMetric {
  campaignId: string;
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  results: Partial<Record<ResultKey, number>>;
}

export interface BudgetChange {
  campaignId: string;
  /** YYYY-MM-DD, in the account's timezone. */
  date: string;
  previous: number;
  next: number;
  kind: "daily" | "lifetime";
  /** Set when the budget belongs to an ad set rather than to the whole campaign. */
  adSetName: string | null;
}

export interface InsightsDataset {
  campaigns: Campaign[];
  rows: DailyMetric[];
  budgetChanges: BudgetChange[];
}

export interface DateRange {
  since: string;
  until: string;
}

export interface AdAccount {
  id: string;
  name: string;
  currency: string;
  status: string;
  businessId: string | null;
  businessName: string | null;
}
