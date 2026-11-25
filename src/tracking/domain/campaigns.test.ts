import { describe, expect, it } from "vitest";
import { buildCampaigns, campaignGroups, campaignOf, CAMPAIGNS } from "./campaigns";
import type { Campaign, DailyMetric, InsightsDataset } from "./dataset";

const adCampaign = (id: string, name: string, objective = "OUTCOME_LEADS"): Campaign => ({ id, accountId: "1", name, objective, status: "PAUSED" });
const day = (campaignId: string, date: string, spend: number, leads = 0): DailyMetric => ({ campaignId, date, spend, impressions: 0, linkClicks: 0, results: { lead: leads } });

describe("the scope of the demo", () => {
  it("covers Impulsa Talent and Menopausa, and nothing else yet", () => {
    expect(CAMPAIGNS.map((c) => c.name)).toEqual(["Impulsa Talent", "Menopausa"]);
  });

  it("reads the token X of PER + X for a campaign in scope", () => {
    expect(campaignOf("PER Menopausa HighIncome40to60 Leads v1")?.key).toBe("Menopausa");
  });

  it("leaves a campaign out of scope unresolved", () => {
    expect(campaignOf("PER Cremats HighIncome Leads v9")).toBeNull();
    expect(campaignOf("VH - Health Comms Congress")).toBeNull();
  });
});

describe("the board", () => {
  const dataset: InsightsDataset = {
    campaigns: [
      adCampaign("c1", "PER Menopausa HighIncome40to60 Leads v1"),
      adCampaign("c2", "PER Menopausa Broad Leads v2"),
      adCampaign("c3", "VAL ImpulsaTalent HotLAL1Socis CostCap Sales v1", "OUTCOME_SALES"),
      adCampaign("c4", "PER Cremats HighIncome Leads v9"),
    ],
    rows: [day("c1", "2026-11-20", 100, 500), day("c2", "2026-11-22", 50, 100), day("c3", "2026-07-10", 4820.5), day("c4", "2026-07-10", 50, 20)],
    budgetChanges: [],
  };
  const board = buildCampaigns({ dataset });
  const byKey = (key: string) => board.campaigns.find((c) => c.key === key)!;

  it("groups every Meta variant of a leads campaign together", () => {
    expect(byKey("Menopausa").adCampaigns.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect([byKey("Menopausa").firstDay, byKey("Menopausa").lastDay]).toEqual(["2026-11-20", "2026-11-22"]);
  });

  it("takes nothing from Meta for a donations campaign, even when a campaign matches", () => {
    expect(byKey("ImpulsaTalent").adCampaigns).toEqual([]);
    expect(byKey("ImpulsaTalent").source).toBe("impulsa");
  });

  it("counts the ad campaigns the demo does not cover", () => {
    expect(board.outOfScope).toBe(2); // the Impulsa Talent sales campaign and Cremats
  });

  it("splits the selector by what the campaign measures, not by whether it is running", () => {
    expect(campaignGroups(board.campaigns).map((g) => [g.label, g.campaigns.map((c) => c.name)])).toEqual([
      ["Campanyes de leads", ["Menopausa"]],
      ["Campanyes de donatius i socis", ["Impulsa Talent"]],
    ]);
  });
});
