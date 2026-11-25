import { isoToCa } from "./format";

/**
 * One row of the Impulsa Talent export, with nothing that identifies a person: the reference
 * replaces the name, the e-mail and the record id, which never leave the Unitat de Mecenatge.
 * `scripts/build-impulsa-aggregate.mjs` writes this file.
 */
export interface DonorRecord {
  ref: string;
  /** Day of registration, YYYY-MM-DD. */
  date: string;
  /** Where the record was created: CRM or Donaciones. */
  system: string;
  /** Traffic source. An export cell left empty means Meta. */
  channel: string;
  /** Amount of one instalment. */
  base: number;
  frequency: string;
  /** Instalments a year, from the export's criterion. */
  instalments: number;
  recurring: boolean;
  state: string;
  included: boolean;
  billedEur: number;
  firstYearEur: number;
}

export interface DonorRecordsFile {
  generatedAt: string;
  sourceSha256: string;
  defaultChannel: string;
  records: DonorRecord[];
}

/** What the Unitat de Mecenatge may change by hand, per record. */
export interface YearEdit {
  /** Amount of one instalment that year, when it differs from the one on file. */
  quota?: number;
  /** Instalments that went unpaid that year. */
  unpaid?: number;
}

export interface DonorOverride {
  channel?: string;
  state?: string;
  years?: Record<string, YearEdit>;
}

export type DonorOverrides = Record<string, DonorOverride>;

export const CHANNEL_OPTIONS = [
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google Ads" },
  { key: "newsletter", label: "Newsletter" },
  { key: "altres", label: "Altres" },
] as const;

export const STATE_OPTIONS = ["Inclòs", "Exclòs", "Cancel·lada"] as const;

/** A row counts towards the figures only in this state. */
export const INCLUDED_STATE = "Inclòs";

export const channelLabel = (key: string) => CHANNEL_OPTIONS.find((c) => c.key === key)?.label ?? key;

export const yearOf = (iso: string) => Number(iso.slice(0, 4));

/**
 * The year columns the table shows: from the first registration to one year past the latest
 * year anyone has touched, so next year is always there to plan with.
 */
export function yearColumns(records: DonorRecord[], overrides: DonorOverrides, today: string): number[] {
  if (!records.length) return [yearOf(today), yearOf(today) + 1];
  const first = Math.min(...records.map((r) => yearOf(r.date)));
  const edited = Object.values(overrides).flatMap((o) => Object.keys(o.years ?? {}).map(Number));
  const last = Math.max(yearOf(today), ...edited, first);
  const years: number[] = [];
  for (let year = first; year <= last + 1; year++) years.push(year);
  return years;
}

export interface YearCell {
  year: number;
  /** Amount of one instalment, after any edit. */
  quota: number;
  /** Instalments due that year, before the unpaid ones. */
  instalments: number;
  unpaid: number;
  /** quota × (instalments − unpaid). */
  value: number;
  /** True when a hand edit moved this cell off its default. */
  edited: boolean;
}

export interface DonorRow extends DonorRecord {
  /** Channel and state after any edit. */
  channel: string;
  channelName: string;
  state: string;
  counts: boolean;
  /** The year it was registered, which carries the first-year figure. */
  firstYear: number;
  years: YearCell[];
  /** Billed to date, less the instalments marked unpaid up to this year. */
  billedEffective: number;
  /** Set when anything on this row was changed by hand. */
  edited: boolean;
}

/** Instalments a record owes in a given year: the ones on file for its first year, and for a
 *  later year only if it recurs. A one-off does not come back. */
const defaultInstalments = (record: DonorRecord, year: number) =>
  year === yearOf(record.date) || record.recurring ? record.instalments : 0;

export function resolveRow(record: DonorRecord, override: DonorOverride | undefined, years: number[], today: string): DonorRow {
  const state = override?.state ?? record.state;
  const channel = override?.channel ?? record.channel;
  const counts = state === INCLUDED_STATE;
  const firstYear = yearOf(record.date);
  const thisYear = yearOf(today);

  const cells: YearCell[] = years.map((year) => {
    const edit = override?.years?.[String(year)] ?? {};
    const quota = edit.quota ?? record.base;
    const instalments = defaultInstalments(record, year);
    const unpaid = Math.min(Math.max(edit.unpaid ?? 0, 0), instalments);
    return {
      year,
      quota,
      instalments,
      unpaid,
      value: counts ? round(quota * Math.max(0, instalments - unpaid)) : 0,
      edited: edit.quota !== undefined || (edit.unpaid ?? 0) > 0,
    };
  });

  // Money already invoiced, less what has been marked unpaid in a year that has happened.
  const unpaidSoFar = cells.filter((c) => c.year <= thisYear).reduce((total, c) => total + c.unpaid * c.quota, 0);

  return {
    ...record,
    channel,
    channelName: channelLabel(channel),
    state,
    counts,
    firstYear,
    years: cells,
    billedEffective: counts ? round(Math.max(0, record.billedEur - unpaidSoFar)) : 0,
    edited: override !== undefined && (override.channel !== undefined || override.state !== undefined || cells.some((c) => c.edited)),
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

export function resolveRows(records: DonorRecord[], overrides: DonorOverrides, years: number[], today: string): DonorRow[] {
  return records.map((record) => resolveRow(record, overrides[record.ref], years, today));
}

export interface DonorTotals {
  records: number;
  counted: number;
  billedEur: number;
  /** Value of each record's own first year: what the export calls the first-year projection. */
  firstYearEur: number;
  /**
   * Everything the records have generated: for each one, every year from the one it was
   * registered in through the year in course. A member who signed up in 2026 and is still
   * paying in 2028 counts 2026, 2027 and 2028; one who signs up in 2028 counts its first
   * year. While every record was registered this year, this equals `firstYearEur`.
   */
  generatedEur: number;
  /** The years `generatedEur` spans, so the figure can say what it covers. */
  generatedFrom: number;
  generatedTo: number;
  /** Value by calendar year, for the columns. */
  byYear: Record<number, number>;
  byChannel: { key: string; label: string; count: number; billedEur: number; firstYearEur: number }[];
  edited: number;
  unpaidInstalments: number;
}

export function donorTotals(rows: DonorRow[], years: number[], today: string): DonorTotals {
  const byYear: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const channels = new Map<string, { count: number; billedEur: number; firstYearEur: number }>();
  const thisYear = yearOf(today);
  let billedEur = 0;
  let firstYearEur = 0;
  let generatedEur = 0;
  let counted = 0;
  let edited = 0;
  let unpaidInstalments = 0;
  let generatedFrom = thisYear;

  for (const row of rows) {
    if (row.edited) edited++;
    for (const cell of row.years) {
      byYear[cell.year] = round((byYear[cell.year] ?? 0) + cell.value);
      if (row.counts) unpaidInstalments += cell.unpaid;
    }
    if (!row.counts) continue;
    counted++;
    billedEur = round(billedEur + row.billedEffective);
    const own = row.years.find((c) => c.year === row.firstYear)?.value ?? 0;
    firstYearEur = round(firstYearEur + own);
    // Every year this record has run, up to and including the one in course.
    generatedEur = round(generatedEur + row.years.filter((c) => c.year >= row.firstYear && c.year <= thisYear).reduce((total, c) => total + c.value, 0));
    generatedFrom = Math.min(generatedFrom, row.firstYear);
    const bucket = channels.get(row.channel) ?? { count: 0, billedEur: 0, firstYearEur: 0 };
    bucket.count++;
    bucket.billedEur = round(bucket.billedEur + row.billedEffective);
    bucket.firstYearEur = round(bucket.firstYearEur + own);
    channels.set(row.channel, bucket);
  }

  return {
    records: rows.length,
    counted,
    billedEur,
    firstYearEur,
    generatedEur,
    generatedFrom,
    generatedTo: thisYear,
    byYear,
    byChannel: [...channels.entries()]
      .map(([key, b]) => ({ key, label: channelLabel(key), ...b }))
      .sort((a, b) => b.firstYearEur - a.firstYearEur),
    edited,
    unpaidInstalments,
  };
}

/**
 * Free-text search over the fields the demo can show. In the Unitat de Mecenatge's own
 * instance the name and the e-mail are part of this same haystack; here they are not loaded,
 * so the table searches everything else.
 */
export function searchRows(rows: DonorRow[], query: string): DonorRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const terms = needle.split(/\s+/);
  return rows.filter((row) => {
    const hay = [row.ref, isoToCa(row.date), row.date, row.system, row.channelName, row.frequency, row.state, String(row.base), String(row.billedEur)].join(" ").toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

/** Only the fields the Unitat de Mecenatge may set, so a bad payload cannot reach the figures. */
export function sanitiseOverride(input: unknown): DonorOverride | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const result: DonorOverride = {};

  if (typeof raw.channel === "string") {
    if (!CHANNEL_OPTIONS.some((c) => c.key === raw.channel)) return null;
    result.channel = raw.channel;
  }
  if (typeof raw.state === "string") {
    if (!STATE_OPTIONS.includes(raw.state as (typeof STATE_OPTIONS)[number])) return null;
    result.state = raw.state;
  }
  if (raw.years !== undefined) {
    if (typeof raw.years !== "object" || raw.years === null) return null;
    const years: Record<string, YearEdit> = {};
    for (const [year, value] of Object.entries(raw.years as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(year)) return null;
      if (typeof value !== "object" || value === null) return null;
      const edit = value as Record<string, unknown>;
      const cell: YearEdit = {};
      if (edit.quota !== undefined) {
        if (typeof edit.quota !== "number" || !Number.isFinite(edit.quota) || edit.quota < 0 || edit.quota > 1_000_000) return null;
        cell.quota = Math.round(edit.quota * 100) / 100;
      }
      if (edit.unpaid !== undefined) {
        if (typeof edit.unpaid !== "number" || !Number.isInteger(edit.unpaid) || edit.unpaid < 0 || edit.unpaid > 366) return null;
        cell.unpaid = edit.unpaid;
      }
      if (cell.quota !== undefined || cell.unpaid !== undefined) years[year] = cell;
    }
    if (Object.keys(years).length) result.years = years;
  }
  return result;
}
