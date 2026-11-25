import { describe, expect, it } from "vitest";
import { AD_SET_BUDGET_EVENT, toBudgetChange, type GraphActivity } from "./budget-mapper";

const extra = (previous: number, next: number, type = "Diario") =>
  JSON.stringify({ old_value: { old_value: previous, additional_value: type }, new_value: { new_value: next, additional_value: type } });

const activity = (overrides: Partial<GraphActivity>): GraphActivity => ({
  event_type: "update_campaign_budget",
  event_time: "2026-09-28T07:56:58+0000",
  object_id: "123",
  object_name: "Campaign",
  extra_data: extra(60000, 64000),
  ...overrides,
});

describe("toBudgetChange", () => {
  it("converts cents and reads the campaign from the event", () => {
    expect(toBudgetChange(activity({}), new Map(), "Europe/Madrid")).toEqual({ campaignId: "123", date: "2026-09-28", previous: 600, next: 640, kind: "daily", adSetName: null });
  });

  it("dates the change in the account's timezone", () => {
    const late = activity({ event_time: "2026-09-28T23:30:00+0000" });
    expect(toBudgetChange(late, new Map(), "Europe/Madrid")?.date).toBe("2026-09-29");
    expect(toBudgetChange(late, new Map(), "America/Santo_Domingo")?.date).toBe("2026-09-28");
  });

  it("traces ad set budgets to their campaign", () => {
    const event = activity({ event_type: AD_SET_BUDGET_EVENT, object_id: "9", object_name: "Ad set", extra_data: extra(50000, 7500, "Presupuesto total") });
    expect(toBudgetChange(event, new Map([["9", "123"]]), "UTC")).toMatchObject({ campaignId: "123", kind: "lifetime", adSetName: "Ad set" });
    expect(toBudgetChange(event, new Map(), "UTC")).toBeNull();
  });

  it("skips events without amounts", () => {
    expect(toBudgetChange(activity({ extra_data: undefined }), new Map(), "UTC")).toBeNull();
  });
});
