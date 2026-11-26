import { createHmac } from "node:crypto";
import type { Donation, DonationStatus, Frequency } from "@/tracking/domain/donations";

/** The fields of a StockCrowd transaction this adapter reads. Everything else is ignored. */
export interface StockCrowdTransaction {
  id: number;
  recurrence?: string | null;
  status?: { id?: number; name?: string } | null;
  amounts?: { total_charged?: number | null } | null;
  gateway?: { name?: string | null } | null;
  creation_date?: string | null;
  donor?: { email?: string | null } | null;
}

/** StockCrowd's recurrence codes, checked against the sheet row by row. */
const FREQUENCY: Record<string, Frequency> = { Z00: "Puntual", Z01: "Mensual", Z02: "Trimestral", Z04: "Anual" };

const STATUS: Record<string, DonationStatus> = {
  succeeded: "charged",
  crm_data_succeeded: "pledged",
  refunded: "refunded",
};

/** How an e-mail is compared: trimmed and in lower case. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/**
 * HMAC-SHA256 of the normalised e-mail, keyed by a secret that never leaves the server: the
 * only form an e-mail takes past this adapter. Without the key, a list of candidate addresses
 * cannot be checked against it. The same function hashes what someone types in the search
 * box, so both sides compare equal.
 */
export const donorKeyOf = (email: string, salt: string) => createHmac("sha256", salt).update(normaliseEmail(email)).digest("hex");

/**
 * One transaction to one domain donation. The e-mail is only used to group a donor's
 * instalments and is hashed here, so no personal field crosses into the domain.
 * Returns null for a transaction the domain cannot place (no date, unknown recurrence).
 */
export function toDonation(t: StockCrowdTransaction, salt: string): Donation | null {
  const date = t.creation_date?.slice(0, 10);
  const frequency = FREQUENCY[t.recurrence ?? ""];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !frequency) return null;

  const status = STATUS[t.status?.name ?? ""] ?? "other";
  const email = normaliseEmail(t.donor?.email ?? "");
  // Without an e-mail the record is its own donor, and no search can find it.
  const donorKey = email ? donorKeyOf(email, salt) : donorKeyOf(`tx:${t.id}`, salt);

  return {
    id: String(t.id),
    donorKey,
    date,
    amount: Math.round((t.amounts?.total_charged ?? 0) * 100) / 100,
    frequency,
    status,
    // The CRM gateway only captures bank details; the card gateways charge.
    system: t.gateway?.name === "CRM" || status === "pledged" ? "CRM" : "Donaciones",
  };
}
