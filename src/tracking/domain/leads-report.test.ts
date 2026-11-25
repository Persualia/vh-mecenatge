import { describe, expect, it } from "vitest";
import { buildCampaigns } from "./campaigns";
import type { Campaign, DailyMetric, InsightsDataset } from "./dataset";
import { buildLeadsReport } from "./leads-report";

const adCampaign = (id: string, name: string): Campaign => ({ id, accountId: "1", name, objective: "OUTCOME_LEADS", status: "PAUSED" });
const day = (campaignId: string, date: string, spend: number, leads: number, linkClicks = 0): DailyMetric => ({ campaignId, date, spend, impressions: 0, linkClicks, results: { lead: leads } });

/** Two ad campaigns of one campaign, so the sums and the CPL can be checked by hand. */
const dataset: InsightsDataset = {
  campaigns: [adCampaign("a", "PER Menopausa HighIncome40to60 Leads v1"), adCampaign("b", "PER Menopausa Broad Leads v2")],
  rows: [day("a", "2026-07-06", 100, 50, 200), day("a", "2026-07-07", 100, 25, 100), day("b", "2026-07-07", 50, 5, 20), day("a", "2026-07-13", 150, 0, 80)],
  budgetChanges: [],
};

const report = (range: { since: string; until: string }, granularity: "day" | "week" = "day") =>
  buildLeadsReport({
    dataset,
    campaign: buildCampaigns({ dataset }).campaigns.find((c) => c.key === "Menopausa")!,
    range,
    granularity,
    currency: "USD",
  });

describe("totals of a leads campaign", () => {
  it("adds the spend and the leads of every ad campaign in the group", () => {
    const { totals } = report({ since: "2026-07-06", until: "2026-07-13" });
    expect(totals.spend).toBe(400);
    expect(totals.results).toBe(80);
  });

  it("divides total spend by total leads, not the average of each campaign's CPL", () => {
    expect(report({ since: "2026-07-06", until: "2026-07-13" }).totals.costPerResult).toBe(400 / 80);
  });

  it("leaves the CPL empty for a period with no leads", () => {
    const { totals, summary } = report({ since: "2026-07-13", until: "2026-07-13" });
    expect(totals.results).toBe(0);
    expect(totals.costPerResult).toBeNull();
    expect(summary).toContain("no es pot calcular");
  });

  it("keeps the conversion rate out of the reading", () => {
    // The currency format uses a non-breaking space before the symbol.
    const summary = report({ since: "2026-07-06", until: "2026-07-06" }).summary.replace(/\u00a0/g, " ");
    expect(summary).toBe("50 leads amb 100,00 $ d’inversió: 2,00 $ per lead.");
    expect(summary).not.toContain("clics");
  });
});

describe("the series", () => {
  it("gives every day in the range, so a day with no delivery is a real zero", () => {
    const series = report({ since: "2026-07-06", until: "2026-07-09" }).series;
    expect(series.map((p) => p.results)).toEqual([50, 30, 0, 0]);
    expect(series.map((p) => p.label)).toEqual(["06/07", "07/07", "08/07", "09/07"]);
  });

  it("adds the whole week together when asked by week", () => {
    const series = report({ since: "2026-07-06", until: "2026-07-19" }, "week").series;
    expect(series.map((p) => [p.label, p.results, p.spend])).toEqual([
      ["06/07", 80, 250],
      ["13/07", 0, 150],
    ]);
  });

  it("marks a period the range cuts short, so a partial bar is not read as a drop", () => {
    const series = report({ since: "2026-07-08", until: "2026-07-19" }, "week").series;
    expect(series[0].complete).toBe(false);
    expect(series[1].complete).toBe(true);
  });
});

describe("the reading of the change", () => {
  it("names the drop in leads, the rise in cost and how the spend moved", () => {
    const change = report({ since: "2026-07-06", until: "2026-07-07" }).change;
    expect(change).toContain("els leads han baixat un 40 %");
    expect(change).toContain("el CPL ha pujat un 150 %");
    expect(change).toContain("inversió més alta (+50 %)");
  });

  it("says nothing with a single period to compare", () => {
    expect(report({ since: "2026-07-06", until: "2026-07-06" }).change).toBeNull();
  });
});
