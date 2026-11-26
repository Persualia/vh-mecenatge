import { ddmm, toDayNumber, toIso } from "./calendar";
import type { DateRange, InsightsDataset } from "./dataset";
import { CRITERION, isRecurring, type Frequency } from "./donations";
import type { DonorRecord, DonorTotals } from "./donors";

/**
 * Shape of the file `scripts/build-impulsa-aggregate.mjs` writes, and of the one
 * `buildImpulsaAggregate` computes from the donations platform.
 */
export interface ImpulsaAggregate {
  generatedAt: string;
  source: {
    /** `file`: frozen export of the sheet. `live`: read from the donations platform on every load. */
    kind?: "file" | "live";
    file: string;
    sha256: string;
    detailRows: number;
    includedRows: number;
    note: string;
  };
  /** Day the figures of the summary block are cut at. */
  cutOff: string;
  /** Where each platform's spend comes from. Absent in the file, where both are the sheet's. */
  spendSources?: { meta: SpendSource; google: SpendSource };
  /** What one year of each frequency is worth, as the file states it. */
  criterion: Record<string, number>;
  cards: {
    spendEur: number;
    metaSpendUsd: number;
    googleSpendEur: number;
    metaSpendEur: number;
    impliedUsdToEur: number;
    billedEur: number;
    yearValueEur: number;
    ratioBilled: number;
    ratioYear: number;
  };
  attribution: { key: string; label: string; count: number; billedEur: number; yearEur: number }[];
  frequency: { key: string; multiplier: number; recurring: boolean; count: number; billedEur: number; yearEur: number }[];
  origin: { key: string; count: number; billedEur: number; yearEur: number }[];
  excluded: { count: number; reasons: { state: string; count: number }[]; billedEur: number; yearEur: number };
  unpaidQuotas: { rowsWithValue: number; note: string };
  weekly: { weekStart: string; oneOffCount: number; oneOffEur: number; recurringCount: number; recurringEur: number; yearEur: number }[];
  registrations: { first: string; last: string; count: number };
  checks: { id: string; label: string; computed: number; declared: number; ok: boolean }[];
  metaChannelRoasBasis: { spendEur: number; yearEur: number; billedEur: number; roasYear: number; roasBilled: number; reproducesYear: boolean; reproducesBilled: boolean };
}

export interface ImpulsaWeek {
  weekStart: string;
  label: string;
  longLabel: string;
  oneOffCount: number;
  oneOffEur: number;
  recurringCount: number;
  recurringEur: number;
  yearEur: number;
}

/** Registrations by week, cut to the chosen period. */
export function impulsaWeeks(aggregate: ImpulsaAggregate, range: DateRange | null): ImpulsaWeek[] {
  const since = range ? toDayNumber(range.since) : -Infinity;
  const until = range ? toDayNumber(range.until) : Infinity;
  return aggregate.weekly
    .filter((week) => {
      const start = toDayNumber(week.weekStart);
      return start + 6 >= since && start <= until;
    })
    .map((week) => {
      const start = toDayNumber(week.weekStart);
      return { ...week, label: ddmm(start), longLabel: `setmana del ${ddmm(start)} al ${ddmm(start + 6)}` };
    });
}

export interface ImpulsaWeeksTotals {
  oneOffCount: number;
  oneOffEur: number;
  recurringCount: number;
  recurringEur: number;
  yearEur: number;
  weeks: number;
}

export function impulsaWeeksTotals(weeks: ImpulsaWeek[]): ImpulsaWeeksTotals {
  return weeks.reduce(
    (total, week) => ({
      oneOffCount: total.oneOffCount + week.oneOffCount,
      oneOffEur: total.oneOffEur + week.oneOffEur,
      recurringCount: total.recurringCount + week.recurringCount,
      recurringEur: total.recurringEur + week.recurringEur,
      yearEur: total.yearEur + week.yearEur,
      weeks: total.weeks + 1,
    }),
    { oneOffCount: 0, oneOffEur: 0, recurringCount: 0, recurringEur: 0, yearEur: 0, weeks: 0 },
  );
}

export interface ImpulsaCards {
  /** Advertising spend, from the file's own summary block. */
  spendEur: number;
  metaSpendUsd: number;
  googleSpendEur: number;
  impliedUsdToEur: number;
  /** Invoiced so far, after any unpaid instalment the Unitat de Mecenatge has recorded. */
  billedEur: number;
  /**
   * Everything the records have generated: every year each one has run, up to the year in
   * course, plus the first year of the ones registered this year.
   */
  generatedEur: number;
  /** The years that figure covers. */
  generatedFrom: number;
  generatedTo: number;
  /** Return so far: what has been invoiced for each euro of advertising. */
  roasBilled: number | null;
  /** Return on the value generated, on the same spend. */
  roasGenerated: number | null;
}

/**
 * The headline figures. Spend comes from the file's summary; the returns are recomputed from
 * the records, so a correction made in the table moves them.
 */
export function impulsaCards(aggregate: ImpulsaAggregate, totals: DonorTotals): ImpulsaCards {
  const spendEur = aggregate.cards.spendEur;
  return {
    spendEur,
    metaSpendUsd: aggregate.cards.metaSpendUsd,
    googleSpendEur: aggregate.cards.googleSpendEur,
    impliedUsdToEur: aggregate.cards.impliedUsdToEur,
    billedEur: totals.billedEur,
    generatedEur: totals.generatedEur,
    generatedFrom: totals.generatedFrom,
    generatedTo: totals.generatedTo,
    roasBilled: spendEur > 0 ? totals.billedEur / spendEur : null,
    roasGenerated: spendEur > 0 ? totals.generatedEur / spendEur : null,
  };
}

/** The criterion of the file, written out: «mensual ×12 · trimestral ×4 · anual ×1 · puntual ×1». */
export const criterionText = (aggregate: ImpulsaAggregate) =>
  Object.entries(aggregate.criterion)
    .map(([key, multiplier]) => `${key.toLowerCase()} ×${multiplier}`)
    .join(" · ");

/** `live`: read from the platform's API on load. `fixed`: a figure kept by hand in the settings. */
export type SpendSource = "live" | "fixed";

/** Advertising spend behind the campaign, in the currencies each platform reports. */
export interface ImpulsaSpend {
  metaSpendUsd: number;
  googleSpendEur: number;
  googleSource: SpendSource;
  /** Euros per dollar, to put Meta's spend next to Google's. */
  usdToEur: number;
}

/** A campaign's spend over a period, in its account's currency. */
export interface CampaignSpend {
  name: string;
  spend: number;
}

/** What the campaigns that belong to the initiative spent, by name. */
export function sumCampaignSpend(campaigns: CampaignSpend[], belongs: (campaignName: string) => boolean): number {
  return round2(campaigns.reduce((total, c) => (belongs(c.name) ? total + c.spend : total), 0));
}

/**
 * Meta's spend on the campaigns that belong to Impulsa Talent, summed over every day loaded.
 * `belongs` says which ad campaigns those are, by name.
 */
export function campaignSpend(dataset: InsightsDataset, belongs: (campaignName: string) => boolean): number {
  const ids = new Set(dataset.campaigns.filter((c) => belongs(c.name)).map((c) => c.id));
  return round2(dataset.rows.reduce((total, row) => (ids.has(row.campaignId) ? total + row.spend : total), 0));
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Monday of the week a day falls in. */
const mondayOf = (iso: string) => {
  const day = toDayNumber(iso);
  return toIso(day - ((((day + 3) % 7) + 7) % 7));
};

/**
 * The aggregate the board draws, computed from the records instead of read from the sheet's
 * summary. The cut-off is today: the source is read live.
 */
export function buildImpulsaAggregate(input: { records: DonorRecord[]; spend: ImpulsaSpend; today: string; sourceName: string }): ImpulsaAggregate {
  const { records, spend, today } = input;
  const included = records.filter((r) => r.included);
  const excluded = records.filter((r) => !r.included);
  const sum = (list: DonorRecord[], field: "billedEur" | "firstYearEur") => round2(list.reduce((t, r) => t + r[field], 0));

  const metaSpendEur = round2(spend.metaSpendUsd * spend.usdToEur);
  const spendEur = round2(metaSpendEur + spend.googleSpendEur);
  const billedEur = sum(included, "billedEur");
  const yearValueEur = sum(included, "firstYearEur");

  const group = <K extends string>(list: DonorRecord[], keyOf: (r: DonorRecord) => K) => {
    const out = new Map<K, { count: number; billedEur: number; yearEur: number }>();
    for (const r of list) {
      const g = out.get(keyOf(r)) ?? { count: 0, billedEur: 0, yearEur: 0 };
      g.count++;
      g.billedEur = round2(g.billedEur + r.billedEur);
      g.yearEur = round2(g.yearEur + r.firstYearEur);
      out.set(keyOf(r), g);
    }
    return out;
  };

  const byFrequency = group(included, (r) => r.frequency);
  const frequency = (Object.keys(CRITERION) as Frequency[])
    .map((key) => ({ key, multiplier: CRITERION[key], recurring: isRecurring(key), ...(byFrequency.get(key) ?? { count: 0, billedEur: 0, yearEur: 0 }) }))
    .filter((f) => f.count > 0);

  // Weeks with no registration are real zeros, not gaps.
  const weeks = new Map<string, ImpulsaAggregate["weekly"][number]>();
  for (const r of included) {
    const key = mondayOf(r.date);
    const w = weeks.get(key) ?? { weekStart: key, oneOffCount: 0, oneOffEur: 0, recurringCount: 0, recurringEur: 0, yearEur: 0 };
    if (r.recurring) {
      w.recurringCount++;
      w.recurringEur = round2(w.recurringEur + r.billedEur);
    } else {
      w.oneOffCount++;
      w.oneOffEur = round2(w.oneOffEur + r.billedEur);
    }
    w.yearEur = round2(w.yearEur + r.firstYearEur);
    weeks.set(key, w);
  }
  const keys = [...weeks.keys()].sort();
  const weekly: ImpulsaAggregate["weekly"] = [];
  if (keys.length) {
    for (let day = toDayNumber(keys[0]); day <= toDayNumber(keys[keys.length - 1]); day += 7) {
      const key = toIso(day);
      weekly.push(weeks.get(key) ?? { weekStart: key, oneOffCount: 0, oneOffEur: 0, recurringCount: 0, recurringEur: 0, yearEur: 0 });
    }
  }

  const dates = included.map((r) => r.date).sort();
  const metaBilled = sum(included.filter((r) => r.channel === "meta"), "billedEur");
  const metaYear = sum(included.filter((r) => r.channel === "meta"), "firstYearEur");

  return {
    generatedAt: today,
    source: {
      kind: "live",
      file: input.sourceName,
      sha256: "",
      detailRows: records.length,
      includedRows: included.length,
      note: "Llegit en directe, sense noms, correus ni identificadors.",
    },
    cutOff: today,
    spendSources: { meta: "live", google: spend.googleSource },
    criterion: CRITERION,
    cards: {
      spendEur,
      metaSpendUsd: spend.metaSpendUsd,
      googleSpendEur: spend.googleSpendEur,
      metaSpendEur,
      impliedUsdToEur: spend.usdToEur,
      billedEur,
      yearValueEur,
      ratioBilled: spendEur > 0 ? round2(billedEur / spendEur) : 0,
      ratioYear: spendEur > 0 ? round2(yearValueEur / spendEur) : 0,
    },
    attribution: [...group(included, (r) => r.channel)].map(([key, g]) => ({ key, label: key, ...g })).sort((a, b) => b.yearEur - a.yearEur),
    frequency,
    origin: [...group(included, (r) => r.system)].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.count - a.count),
    excluded: {
      count: excluded.length,
      reasons: [...group(excluded, (r) => r.state)].map(([state, g]) => ({ state, count: g.count })),
      billedEur: sum(excluded, "billedEur"),
      yearEur: sum(excluded, "firstYearEur"),
    },
    unpaidQuotas: { rowsWithValue: 0, note: "Les quotes impagades s’anoten a la taula de donants i socis." },
    weekly,
    registrations: { first: dates[0] ?? today, last: dates[dates.length - 1] ?? today, count: included.length },
    checks: [],
    metaChannelRoasBasis: {
      spendEur: metaSpendEur,
      yearEur: metaYear,
      billedEur: metaBilled,
      roasYear: metaSpendEur > 0 ? round2(metaYear / metaSpendEur) : 0,
      roasBilled: metaSpendEur > 0 ? round2(metaBilled / metaSpendEur) : 0,
      reproducesYear: true,
      reproducesBilled: true,
    },
  };
}
