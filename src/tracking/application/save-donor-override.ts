import { EXCLUDED_STATE, sanitiseOverride, type DonorOverrides } from "@/tracking/domain/donors";
import type { ImpulsaRepository } from "./ports/impulsa-repository";
import type { DonorOverridesRepository } from "./ports/donor-overrides-repository";
import { InvalidRequestError } from "./load-tracking-board";

/** Writes one record's hand corrections, after checking the record and the payload. */
export class SaveDonorOverride {
  constructor(
    private readonly records: ImpulsaRepository,
    private readonly overrides: DonorOverridesRepository,
  ) {}

  async execute(ref: unknown, payload: unknown, today: string): Promise<DonorOverrides> {
    // R-001… from the old sheet, SC-<id> from the donations platform.
    if (typeof ref !== "string" || !/^(R-\d{3,}|SC-\d+)$/.test(ref)) throw new InvalidRequestError("La referència del registre no és vàlida.");

    const known = await this.records.loadRecords(today);
    const record = known.records.find((r) => r.ref === ref);
    if (!record) throw new InvalidRequestError(`No hi ha cap registre amb la referència ${ref}.`);

    const override = sanitiseOverride(payload);
    if (override === null) throw new InvalidRequestError("La correcció té algun valor fora dels permesos.");
    if (record.state === EXCLUDED_STATE && override.state !== undefined) throw new InvalidRequestError(`${ref} està retornat a la plataforma; el seu estat no es pot canviar a mà.`);

    return this.overrides.save(ref, override);
  }
}
