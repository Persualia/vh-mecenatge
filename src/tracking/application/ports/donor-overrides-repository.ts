import type { DonorOverride, DonorOverrides } from "@/tracking/domain/donors";

/**
 * The corrections the Unitat de Mecenatge makes by hand. They live apart from the export, so
 * regenerating the aggregate never loses them and the export stays the record of what the
 * platforms reported.
 */
export interface DonorOverridesRepository {
  load(): Promise<DonorOverrides>;
  /** Replaces one record's corrections. An empty override clears the record. */
  save(ref: string, override: DonorOverride): Promise<DonorOverrides>;
}
