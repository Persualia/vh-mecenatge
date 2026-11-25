import { ddmm, periodOf, toDayNumber, type DayNumber, type Granularity } from "./calendar";
import type { BoardCampaign } from "./campaigns";
import type { BudgetChange, DateRange, InsightsDataset } from "./dataset";
import { int, money, signedPct } from "./format";

/** A leads campaign measures one thing. */
const RESULT_KEY = "lead" as const;

export const LEADS_COPY = {
  option: "Leads",
  one: "lead",
  many: "leads",
  the: "els leads",
  ofThe: "dels leads",
  cost: "CPL",
  costLabel: "Cost per lead",
} as const;

export interface Totals {
  spend: number;
  results: number;
  /** Total spend ÷ total leads. Null with no leads in the period, never a zero. */
  costPerResult: number | null;
  linkClicks: number;
  impressions: number;
  days: number;
}

export interface SeriesPoint {
  key: DayNumber;
  label: string;
  longLabel: string;
  spend: number;
  results: number;
  costPerResult: number | null;
  /** False for a period the range cuts short, so a partial bar is never read as a drop. */
  complete: boolean;
}

export interface LeadsReport {
  campaign: BoardCampaign;
  currency: string;
  range: DateRange;
  granularity: Granularity;
  totals: Totals;
  series: SeriesPoint[];
  budgetChanges: BudgetChange[];
  /** One sentence with the figures of the period. */
  summary: string;
  /** What changed in the last complete period, and whether spend moved with it. */
  change: string | null;
}

const costPerResult = (spend: number, results: number) => (results > 0 ? spend / results : null);
const delta = (now: number, before: number) => (before > 0 ? now / before - 1 : null);

export interface BuildLeadsReportInput {
  dataset: InsightsDataset;
  campaign: BoardCampaign;
  range: DateRange;
  granularity: Granularity;
  currency: string;
}

export function buildLeadsReport({ dataset, campaign, range, granularity, currency }: BuildLeadsReportInput): LeadsReport {
  const ids = new Set(campaign.adCampaigns.map((c) => c.id));
  const since = toDayNumber(range.since);
  const until = toDayNumber(range.until);

  const rows = dataset.rows.filter((row) => {
    if (!ids.has(row.campaignId)) return false;
    const day = toDayNumber(row.date);
    return day >= since && day <= until;
  });

  const totals: Totals = { spend: 0, results: 0, costPerResult: null, linkClicks: 0, impressions: 0, days: 0 };
  const days = new Set<string>();
  const buckets = new Map<DayNumber, { spend: number; results: number }>();

  for (const row of rows) {
    const value = row.results[RESULT_KEY] ?? 0;
    totals.spend += row.spend;
    totals.results += value;
    totals.linkClicks += row.linkClicks;
    totals.impressions += row.impressions;
    days.add(row.date);
    const period = periodOf(toDayNumber(row.date), granularity);
    const bucket = buckets.get(period.key) ?? { spend: 0, results: 0 };
    bucket.spend += row.spend;
    bucket.results += value;
    buckets.set(period.key, bucket);
  }

  totals.days = days.size;
  totals.costPerResult = costPerResult(totals.spend, totals.results);

  // Every period in the range, so a day with no delivery shows as a real zero.
  const series: SeriesPoint[] = [];
  for (let day = periodOf(since, granularity).start; day <= until; day = periodOf(day, granularity).end + 1) {
    const period = periodOf(day, granularity);
    const bucket = buckets.get(period.key) ?? { spend: 0, results: 0 };
    series.push({
      key: period.key,
      label: ddmm(period.start),
      longLabel: granularity === "day" ? ddmm(period.start) : `setmana del ${ddmm(period.start)} al ${ddmm(period.end)}`,
      spend: bucket.spend,
      results: bucket.results,
      costPerResult: costPerResult(bucket.spend, bucket.results),
      complete: period.start >= since && period.end <= until,
    });
  }

  return {
    campaign,
    currency,
    range,
    granularity,
    totals,
    series,
    budgetChanges: dataset.budgetChanges.filter((b) => ids.has(b.campaignId) && toDayNumber(b.date) >= since && toDayNumber(b.date) <= until),
    summary: summarise(totals, currency),
    change: describeChange(series, granularity),
  };
}

function summarise(totals: Totals, currency: string): string {
  if (totals.spend === 0 && totals.results === 0) return "Sense dades de publicació en aquest període.";
  const amount = money(totals.spend, currency);
  if (totals.results === 0) return `${amount} d’inversió en ${totals.days} dies de publicació, sense leads en aquest període: el CPL no es pot calcular.`;
  return `${int(totals.results)} ${totals.results === 1 ? "lead" : "leads"} amb ${amount} d’inversió: ${money(totals.costPerResult, currency)} per lead.`;
}

/**
 * The reading the view is built for: whether leads fell, whether the cost rose, and whether
 * either moved together with the spend. Only complete periods are compared.
 */
function describeChange(series: SeriesPoint[], granularity: Granularity): string | null {
  const complete = series.filter((p) => p.complete && (p.spend > 0 || p.results > 0));
  if (complete.length < 2) return null;
  const now = complete[complete.length - 1];
  const before = complete[complete.length - 2];

  const resultsChange = delta(now.results, before.results);
  const costChange = now.costPerResult !== null && before.costPerResult !== null ? delta(now.costPerResult, before.costPerResult) : null;
  const spendChange = delta(now.spend, before.spend);
  const size = (x: number) => signedPct(x).replace(/^[+−]/, "");

  const parts: string[] = [];
  if (resultsChange !== null && Math.abs(resultsChange) >= 0.05) parts.push(`els leads ${resultsChange > 0 ? "han pujat" : "han baixat"} un ${size(resultsChange)}`);
  if (costChange !== null && Math.abs(costChange) >= 0.05) parts.push(`el CPL ${costChange > 0 ? "ha pujat" : "ha baixat"} un ${size(costChange)}`);

  const span = granularity === "day" ? "Respecte del dia anterior" : granularity === "week" ? "Respecte de la setmana anterior" : "Respecte del mes anterior";
  const which = before.longLabel.replace(/^setmana /, "");
  if (!parts.length) return `${span} (${which}), els leads i el CPL s’han mantingut.`;

  const spendNote =
    spendChange === null || Math.abs(spendChange) < 0.05
      ? `amb una inversió pràcticament igual (${signedPct(spendChange ?? 0)})`
      : `amb una inversió ${spendChange > 0 ? "més alta" : "més baixa"} (${signedPct(spendChange)})`;
  return `${span} (${which}), ${parts.join(" i ")}, ${spendNote}.`;
}
