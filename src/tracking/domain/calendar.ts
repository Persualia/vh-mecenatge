import type { DateRange } from "./dataset";

/** Days since the Unix epoch. All period maths runs on these, always in UTC. */
export type DayNumber = number;

export type Granularity = "day" | "week" | "month";

export interface Period {
  key: DayNumber;
  start: DayNumber;
  end: DayNumber;
  complete: boolean;
}

const DAY_MS = 86_400_000;

export const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
export const MONTHS_SHORT = ["gen", "feb", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"];

const pad = (x: number) => (x < 10 ? "0" : "") + x;

export const toDayNumber = (iso: string): DayNumber =>
  Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS);

export const toDate = (n: DayNumber) => new Date(n * DAY_MS);
export const toIso = (n: DayNumber) => toDate(n).toISOString().slice(0, 10);
export const ddmm = (n: DayNumber) => pad(toDate(n).getUTCDate()) + "/" + pad(toDate(n).getUTCMonth() + 1);
export const shortYear = (n: DayNumber) => String(toDate(n).getUTCFullYear()).slice(2);
export const ddmmyy = (n: DayNumber) => ddmm(n) + "/" + shortYear(n);

/** 0 = Monday … 6 = Sunday. The epoch was a Thursday, hence the +3. */
const weekday = (n: DayNumber) => (((n + 3) % 7) + 7) % 7;

export function periodOf(n: DayNumber, granularity: Granularity): Omit<Period, "complete"> {
  if (granularity === "day") return { key: n, start: n, end: n };
  if (granularity === "week") {
    const start = n - weekday(n);
    return { key: start, start, end: start + 6 };
  }
  const d = toDate(n);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS;
  return { key: start, start, end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY_MS };
}

/** Days of history the board loads: enough to cover every initiative of the year. */
export const HISTORY_DAYS = 365;

/**
 * The daily data the board loads. Today is left out: its figures are still partial,
 * and a half day of delivery reads as a collapse on a daily chart.
 */
export function dataWindow(today: string, days = HISTORY_DAYS): DateRange {
  const until = toDayNumber(today) - 1;
  return { since: toIso(until - days + 1), until: toIso(until) };
}

export interface RangePreset {
  id: string;
  label: string;
  /** Null means the whole period of what is being looked at. */
  days: number | null;
}

/** What the date filter offers. Each one is counted back from the last day with data. */
export const RANGE_PRESETS: RangePreset[] = [
  { id: "all", label: "Tot el període", days: null },
  { id: "7", label: "Últims 7 dies", days: 7 },
  { id: "30", label: "Últims 30 dies", days: 30 },
  { id: "90", label: "Últims 90 dies", days: 90 },
];

/** Keeps a range inside the days that actually hold data. */
export function clampRange(range: DateRange, bounds: DateRange): DateRange {
  const since = Math.max(toDayNumber(range.since), toDayNumber(bounds.since));
  const until = Math.min(toDayNumber(range.until), toDayNumber(bounds.until));
  return { since: toIso(Math.min(since, until)), until: toIso(Math.max(since, until)) };
}

/** The range a preset means within the given bounds. */
export function presetRange(preset: RangePreset, bounds: DateRange): DateRange {
  if (preset.days === null) return bounds;
  const until = toDayNumber(bounds.until);
  return clampRange({ since: toIso(until - preset.days + 1), until: bounds.until }, bounds);
}

/** "del 02/07/26 al 11/11/26", for the caption under a chart. */
export const rangeText = (range: DateRange) => `del ${ddmmyy(toDayNumber(range.since))} al ${ddmmyy(toDayNumber(range.until))}`;
