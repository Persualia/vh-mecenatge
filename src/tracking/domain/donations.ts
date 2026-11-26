import type { DonorRecord } from "./donors";

/**
 * One movement on the donations platform, already stripped of anything that identifies a
 * person. `donorKey` is an opaque key that groups the movements of the same donor; it never
 * leaves the server.
 */
export interface Donation {
  /** The platform's own id: stable, so a hand correction stays on its record. */
  id: string;
  donorKey: string;
  /** Day it was created, YYYY-MM-DD. */
  date: string;
  amount: number;
  frequency: Frequency;
  status: DonationStatus;
  /**
   * Who collects the money. `Donaciones`: the platform charges the card, one movement per
   * instalment. `CRM`: the platform only captures the bank details and the Unitat de
   * Mecenatge's CRM charges the instalments, so the platform never sees them.
   */
  system: "Donaciones" | "CRM";
}

export type Frequency = "Puntual" | "Mensual" | "Trimestral" | "Anual";

/**
 * charged: money received. pledged: bank details captured for the CRM to charge. refunded:
 * given back. Anything else (failed, abandoned, expired checkout) never became a record.
 */
export type DonationStatus = "charged" | "pledged" | "refunded" | "other";

/** What one year of each frequency is worth: the criterion the Unitat de Mecenatge works with. */
export const CRITERION: Record<Frequency, number> = { Mensual: 12, Trimestral: 4, Anual: 1, Puntual: 1 };

const MONTHS_BETWEEN: Record<Frequency, number> = { Mensual: 1, Trimestral: 3, Anual: 12, Puntual: Infinity };

export const isRecurring = (frequency: Frequency) => frequency !== "Puntual";

/**
 * Instalments due from the day of registration up to `today`, both included: the first one
 * on signing up, then one each period that starts. A one-off is due once. This is the rule
 * the original sheet applied to work out what had been invoiced.
 */
export function instalmentsDue(date: string, frequency: Frequency, today: string): number {
  if (today < date) return 0;
  if (!isRecurring(frequency)) return 1;
  const months = (Number(today.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(date.slice(5, 7));
  return Math.floor(months / MONTHS_BETWEEN[frequency]) + 1;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * One record per gift. A card subscription shows up as one movement per instalment charged,
 * so its movements are folded into one record whose first movement names it; everything
 * else is a record of its own.
 */
/** StockCrowd does not record where a donor came from: every record starts as `defaultChannel`
 * and the Unitat de Mecenatge corrects the exceptions by hand. */
export function donorRecordsFromDonations(donations: Donation[], today: string, defaultChannel = "meta"): DonorRecord[] {
  const counted = donations.filter((d) => d.status !== "other").sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const groups = new Map<string, Donation[]>();
  for (const donation of counted) {
    const folds = donation.system === "Donaciones" && isRecurring(donation.frequency);
    const key = folds ? `${donation.donorKey}|${donation.frequency}|${donation.amount}` : `id|${donation.id}`;
    groups.set(key, [...(groups.get(key) ?? []), donation]);
  }

  return [...groups.values()].map((movements) => {
    const first = movements[0];
    const live = movements.filter((m) => m.status !== "refunded");
    const included = live.length > 0;
    const actual = first.system === "Donaciones";
    // What the platform has charged, when it charges; otherwise what the CRM is due to have charged.
    const billedEur = !included
      ? 0
      : actual
        ? round(live.filter((m) => m.status === "charged").reduce((total, m) => total + m.amount, 0))
        : round(first.amount * instalmentsDue(first.date, first.frequency, today));

    return {
      ref: `SC-${first.id}`,
      date: first.date,
      system: first.system,
      channel: defaultChannel,
      base: first.amount,
      frequency: first.frequency,
      instalments: CRITERION[first.frequency],
      recurring: isRecurring(first.frequency),
      state: included ? "Inclòs" : "Exclòs",
      included,
      billedEur,
      billedIsActual: actual,
      firstYearEur: included ? round(first.amount * CRITERION[first.frequency]) : 0,
    };
  });
}

/**
 * The records one donor holds. Records fold within a donor, never across, so the refs from
 * that donor's movements alone are the same ones the full table shows.
 */
export function refsOfDonor(donations: Donation[], donorKey: string, today: string): string[] {
  return donorRecordsFromDonations(donations.filter((d) => d.donorKey === donorKey), today).map((r) => r.ref);
}
