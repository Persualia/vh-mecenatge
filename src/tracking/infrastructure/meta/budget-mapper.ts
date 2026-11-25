import type { BudgetChange } from "@/tracking/domain/dataset";

export interface GraphActivity {
  event_type: string;
  event_time: string;
  object_id: string;
  object_name: string;
  extra_data?: string;
}

interface BudgetValue {
  old_value?: number;
  new_value?: number;
  /** Budget type, translated to the token owner's language: "Diario", "Presupuesto total"… */
  additional_value?: string;
}

const CAMPAIGN_BUDGET_EVENT = "update_campaign_budget";
export const AD_SET_BUDGET_EVENT = "update_ad_set_budget";
export const BUDGET_EVENTS = [CAMPAIGN_BUDGET_EVENT, AD_SET_BUDGET_EVENT];

const LIFETIME = /total|lifetime|vitalici/i;

/** Null when the event has no amounts, or its ad set can no longer be traced to a campaign. */
export function toBudgetChange(activity: GraphActivity, campaignOfAdSet: Map<string, string>, timeZone: string): BudgetChange | null {
  const isAdSet = activity.event_type === AD_SET_BUDGET_EVENT;
  const campaignId = isAdSet ? campaignOfAdSet.get(activity.object_id) : activity.object_id;
  const data: { old_value?: BudgetValue; new_value?: BudgetValue } = JSON.parse(activity.extra_data || "{}");
  const previous = data.old_value?.old_value;
  const next = data.new_value?.new_value;
  if (!campaignId || previous === undefined || next === undefined) return null;
  return {
    campaignId,
    date: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date(activity.event_time)),
    // Meta sends amounts in cents.
    previous: previous / 100,
    next: next / 100,
    kind: LIFETIME.test(data.new_value?.additional_value ?? "") ? "lifetime" : "daily",
    adSetName: isAdSet ? activity.object_name : null,
  };
}
