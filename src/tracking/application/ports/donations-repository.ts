import type { Donation } from "@/tracking/domain/donations";
import type { FetchOptions } from "./fetch-options";

/** Every movement of the campaign on the donations platform, without personal data. */
export interface DonationsRepository {
  list(options?: FetchOptions): Promise<Donation[]>;
  /** The `donorKey` an e-mail would have: lets the server find a donor without keeping the address. */
  keyFor(email: string): string;
  /** What the board names the source by, e.g. the platform and the campaign. */
  readonly sourceName: string;
}
