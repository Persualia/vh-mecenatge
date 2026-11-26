import type { DonorRecordsFile } from "@/tracking/domain/donors";
import type { ImpulsaAggregate } from "@/tracking/domain/impulsa";

/**
 * The Impulsa Talent figures, as of `today`. Two implementations: the frozen export of the
 * sheet, and the live read from the donations platform.
 */
export interface ImpulsaRepository {
  load(today: string): Promise<ImpulsaAggregate>;
  /** One row per record, with nothing that identifies a person. */
  loadRecords(today: string): Promise<DonorRecordsFile>;
  /**
   * The refs of the records made with this e-mail, or null when the source holds no e-mails
   * (the frozen export). The e-mail is compared by hash and never stored or returned.
   */
  findRefsByEmail(email: string, today: string): Promise<string[] | null>;
}
