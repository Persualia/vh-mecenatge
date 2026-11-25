import "server-only";
import type { ImpulsaRepository } from "@/tracking/application/ports/impulsa-repository";
import type { DonorRecordsFile } from "@/tracking/domain/donors";
import type { ImpulsaAggregate } from "@/tracking/domain/impulsa";
import aggregate from "@/tracking/data/impulsa-aggregate.json";
import records from "@/tracking/data/impulsa-records.json";

/**
 * Reads the two files `scripts/build-impulsa-aggregate.mjs` writes from the export. The
 * original CSV never reaches the repository or the browser: these files hold sums and rows
 * with no name, e-mail or record identifier. The contract version replaces this adapter with
 * one that reads StockCrowd.
 */
export class BundledImpulsaRepository implements ImpulsaRepository {
  async load(): Promise<ImpulsaAggregate> {
    return aggregate as ImpulsaAggregate;
  }

  async loadRecords(): Promise<DonorRecordsFile> {
    return records as DonorRecordsFile;
  }
}
