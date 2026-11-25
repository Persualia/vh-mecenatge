/** Catalan number formatting: thousands with a dot, decimals with a comma. */

const CA = "ca-ES";

const cache = new Map<string, Intl.NumberFormat>();
const nf = (key: string, options: Intl.NumberFormatOptions) => {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(CA, options)));
  return f;
};

/** The en dash every view uses where a figure cannot be computed. */
export const NO_VALUE = "–";

const guard = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** Whole number: 4002 → "4.002". */
export const int = (v: number | null | undefined) => (guard(v) ? nf("int", { maximumFractionDigits: 0 }).format(v) : NO_VALUE);

/** Fixed decimals: 0.1866 → "0,19". */
export const decimal = (v: number | null | undefined, digits = 2) =>
  guard(v) ? nf(`d${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : NO_VALUE;

/** Amount in its own currency: "747,19 $", "6.601 €". */
export const money = (v: number | null | undefined, currency: string, digits = 2) =>
  guard(v)
    ? nf(`m${currency}${digits}`, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
    : NO_VALUE;

export const eur = (v: number | null | undefined, digits = 2) => money(v, "EUR", digits);

/** Rounded amount for a headline figure: "6.601 €". */
export const moneyRound = (v: number | null | undefined, currency: string) => money(v, currency, 0);

/** A multiplier, the way the Impulsa Talent file writes it: 2.76 → "2,76×". */
export const ratio = (v: number | null | undefined, digits = 2) => (guard(v) ? decimal(v, digits) + "×" : NO_VALUE);

/** Share of a whole: 0.377 → "37,7 %". */
export const pct = (v: number | null | undefined, digits = 1) =>
  guard(v) ? nf(`p${digits}`, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : NO_VALUE;

/** Signed change: 0.12 → "+12 %", −0.08 → "−8 %". Below half a point it reads as flat. */
export const signedPct = (v: number | null | undefined) => {
  if (!guard(v)) return NO_VALUE;
  const size = Math.abs(v * 100);
  if (size < 0.5) return "0 %";
  return (v > 0 ? "+" : "−") + nf("p0abs", { maximumFractionDigits: 0 }).format(size) + " %";
};

/** "2026-11-12" → "12/11/2026". */
export const isoToCa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const joinAnd = (items: string[]) =>
  items.length > 1 ? items.slice(0, -1).join(", ") + " i " + items[items.length - 1] : (items[0] ?? "");

/** "HighIncome40to60" → "High Income 40 to 60", so audience codes can be read. */
export const spaced = (token: string) =>
  token
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .trim();
