import "server-only";
import type { CampaignInsightsRepository } from "@/tracking/application/ports/campaign-insights-repository";
import { toDayNumber, toIso } from "@/tracking/domain/calendar";
import type { BudgetChange, DateRange, InsightsDataset } from "@/tracking/domain/dataset";
import { MetaApiError, type GraphClient } from "./graph-client";
import { AD_SET_BUDGET_EVENT, BUDGET_EVENTS, toBudgetChange, type GraphActivity } from "./budget-mapper";
import { toCampaigns, toDailyMetric, type GraphInsightRow } from "./insights-mapper";

const FIELDS = "campaign_id,campaign_name,objective,spend,impressions,inline_link_clicks,actions,video_thruplay_watched_actions";

/** Six months of daily rows in one call makes Meta fail after ~50 s; 14-day chunks stay well clear of that. */
const CHUNK_DAYS = 14;

/** By default the edge leaves archived and deleted ad sets out, and old budget changes point at those too. */
const AD_SET_STATUSES = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ARCHIVED", "DELETED", "IN_PROCESS", "WITH_ISSUES"];

function chunks({ since, until }: DateRange): DateRange[] {
  const end = toDayNumber(until);
  const ranges: DateRange[] = [];
  for (let start = toDayNumber(since); start <= end; start += CHUNK_DAYS) {
    ranges.push({ since: toIso(start), until: toIso(Math.min(start + CHUNK_DAYS - 1, end)) });
  }
  return ranges;
}

export class MetaCampaignInsightsRepository implements CampaignInsightsRepository {
  constructor(private readonly graph: GraphClient) {}

  async fetchDaily(accountId: string, range: DateRange): Promise<InsightsDataset> {
    const [statuses, budgetChanges, ...pieces] = await Promise.all([this.fetchStatuses(accountId), this.fetchBudgetChanges(accountId, range), ...chunks(range).map((chunk) => this.fetchRows(accountId, chunk))]);
    const rows = pieces.flat();
    return { campaigns: toCampaigns(rows, accountId, statuses), rows: rows.map(toDailyMetric), budgetChanges };
  }

  private async fetchRows(accountId: string, range: DateRange): Promise<GraphInsightRow[]> {
    try {
      return await this.graph.getAll<GraphInsightRow>(`act_${accountId}/insights`, {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify(range),
        fields: FIELDS,
        limit: "200",
      });
    } catch (error) {
      const days = toDayNumber(range.until) - toDayNumber(range.since);
      if (!(error instanceof MetaApiError) || !error.isTooMuchData || days < 1) throw error;
      const middle = toDayNumber(range.since) + Math.floor(days / 2);
      const halves = await Promise.all([
        this.fetchRows(accountId, { since: range.since, until: toIso(middle) }),
        this.fetchRows(accountId, { since: toIso(middle + 1), until: range.until }),
      ]);
      return halves.flat();
    }
  }

  private async fetchBudgetChanges(accountId: string, range: DateRange): Promise<BudgetChange[]> {
    const [{ timezone_name: timeZone }, activities] = await Promise.all([
      this.graph.get<{ timezone_name: string }>(`act_${accountId}`, { fields: "timezone_name" }),
      this.graph.getAll<GraphActivity>(`act_${accountId}/activities`, {
        category: "BUDGET",
        fields: "event_type,event_time,object_id,object_name,extra_data",
        since: range.since,
        until: toIso(toDayNumber(range.until) + 1),
        limit: "500",
      }),
    ]);
    const events = activities.filter((a) => BUDGET_EVENTS.includes(a.event_type));
    const campaignOfAdSet = events.some((a) => a.event_type === AD_SET_BUDGET_EVENT) ? await this.fetchAdSetCampaigns(accountId) : new Map<string, string>();
    return events.flatMap((a) => toBudgetChange(a, campaignOfAdSet, timeZone) ?? []);
  }

  private async fetchAdSetCampaigns(accountId: string): Promise<Map<string, string>> {
    const adSets = await this.graph.getAll<{ id: string; campaign_id: string }>(`act_${accountId}/adsets`, {
      fields: "id,campaign_id",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: AD_SET_STATUSES }]),
      limit: "500",
    });
    return new Map(adSets.map((a) => [a.id, a.campaign_id]));
  }

  private async fetchStatuses(accountId: string): Promise<Map<string, string>> {
    const campaigns = await this.graph.getAll<{ id: string; effective_status: string }>(`act_${accountId}/campaigns`, { fields: "id,effective_status", limit: "500" });
    return new Map(campaigns.map((c) => [c.id, c.effective_status]));
  }
}
