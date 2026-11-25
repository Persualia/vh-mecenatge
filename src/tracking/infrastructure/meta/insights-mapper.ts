import type { Campaign, DailyMetric, ResultKey } from "@/tracking/domain/dataset";

export interface GraphAction {
  action_type: string;
  value: string;
}

export interface GraphInsightRow {
  campaign_id: string;
  campaign_name: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: GraphAction[];
  video_thruplay_watched_actions?: GraphAction[];
  date_start: string;
}

/** Graph API has no "results" field, so each result is read from its action type. */
const RESULT_ACTIONS: Partial<Record<string, ResultKey>> = {
  lead: "lead",
  purchase: "purchase",
  complete_registration: "complete_registration",
  landing_page_view: "landing_page_view",
  link_click: "link_click",
  post_engagement: "post_engagement",
};

export function toDailyMetric(row: GraphInsightRow): DailyMetric {
  const results: DailyMetric["results"] = {};
  for (const action of row.actions ?? []) {
    const key = RESULT_ACTIONS[action.action_type];
    if (key) results[key] = Number(action.value);
  }
  const thruplays = row.video_thruplay_watched_actions?.reduce((total, a) => total + Number(a.value), 0);
  if (thruplays) results.thruplay = thruplays;
  return {
    campaignId: row.campaign_id,
    date: row.date_start,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    results,
  };
}

/** One entry per campaign. Those missing from `statuses` are archived or deleted. */
export function toCampaigns(rows: GraphInsightRow[], accountId: string, statuses: Map<string, string>): Campaign[] {
  const campaigns = new Map<string, Campaign>();
  for (const row of rows) {
    campaigns.set(row.campaign_id, {
      id: row.campaign_id,
      accountId,
      name: row.campaign_name,
      objective: row.objective ?? "",
      status: statuses.get(row.campaign_id) ?? "ARCHIVED",
    });
  }
  return [...campaigns.values()];
}
