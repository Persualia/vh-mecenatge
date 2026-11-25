import { ddmm, toDayNumber } from "./calendar";
import type { DateRange } from "./dataset";
import type { DonorTotals } from "./donors";

/** Shape of the file `scripts/build-impulsa-aggregate.mjs` writes. */
export interface ImpulsaAggregate {
  generatedAt: string;
  source: { file: string; sha256: string; detailRows: number; includedRows: number; note: string };
  /** Day the figures of the summary block are cut at. */
  cutOff: string;
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
