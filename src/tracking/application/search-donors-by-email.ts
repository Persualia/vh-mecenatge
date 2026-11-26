import type { ImpulsaRepository } from "./ports/impulsa-repository";
import { InvalidRequestError } from "./load-tracking-board";

/** Loose on purpose: it only has to tell an address from a typo, StockCrowd already validated them. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Finds a donor's records by e-mail without the e-mail ever reaching the browser: the server
 * hashes what was typed and compares it with the hashes of the platform's addresses.
 */
export class SearchDonorsByEmail {
  constructor(private readonly records: ImpulsaRepository) {}

  async execute(email: unknown, today: string): Promise<string[]> {
    if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email.trim())) throw new InvalidRequestError("Això no sembla una adreça de correu.");
    const refs = await this.records.findRefsByEmail(email, today);
    if (refs === null) throw new InvalidRequestError("Aquesta font no té correus: la cerca per correu només funciona llegint de StockCrowd.");
    return refs;
  }
}
