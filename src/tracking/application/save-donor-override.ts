import { sanitiseOverride, type DonorOverrides } from "@/tracking/domain/donors";
import type { ImpulsaRepository } from "./ports/impulsa-repository";
import type { DonorOverridesRepository } from "./ports/donor-overrides-repository";
import { InvalidRequestError } from "./load-tracking-board";

/** Writes one record's hand corrections, after checking the record and the payload. */
export class SaveDonorOverride {
  constructor(
    private readonly records: ImpulsaRepository,
    private readonly overrides: DonorOverridesRepository,
  ) {}

  async execute(ref: unknown, payload: unknown): Promise<DonorOverrides> {
    if (typeof ref !== "string" || !/^R-\d{3,}$/.test(ref)) throw new InvalidRequestError("La referència del registre no és vàlida.");

    const known = await this.records.loadRecords();
    if (!known.records.some((record) => record.ref === ref)) throw new InvalidRequestError(`No hi ha cap registre amb la referència ${ref}.`);

    const override = sanitiseOverride(payload);
    if (override === null) throw new InvalidRequestError("La correcció té algun valor fora dels permesos.");

    return this.overrides.save(ref, override);
  }
}
