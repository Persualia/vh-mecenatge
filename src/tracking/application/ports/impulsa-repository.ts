import type { DonorRecordsFile } from "@/tracking/domain/donors";
import type { ImpulsaAggregate } from "@/tracking/domain/impulsa";

/**
 * The Impulsa Talent figures. The port exists so the contract version can read them from
 * StockCrowd instead of from the generated files, with no change above.
 */
export interface ImpulsaRepository {
  load(): Promise<ImpulsaAggregate>;
  /** One row per record, with nothing that identifies a person. */
  loadRecords(): Promise<DonorRecordsFile>;
}
