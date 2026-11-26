import "server-only";
import type { DonationsRepository } from "@/tracking/application/ports/donations-repository";
import type { Donation } from "@/tracking/domain/donations";
import type { StockCrowdClient } from "./stockcrowd-client";
import { donorKeyOf, toDonation, type StockCrowdTransaction } from "./transaction-mapper";

/**
 * The campaign's transactions on StockCrowd. One board load asks for them twice (aggregate
 * and table), so the result is kept for a few minutes and an in-flight read is shared.
 */
export class StockCrowdDonationsRepository implements DonationsRepository {
  private cached: { expires: number; value: Promise<Donation[]> } | null = null;

  constructor(
    private readonly client: StockCrowdClient,
    private readonly campaignId: number,
    readonly sourceName: string,
    /** Key of the e-mail hash. Fixed, so a hash means the same donor across restarts. */
    private readonly salt: string,
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  keyFor(email: string): string {
    return donorKeyOf(email, this.salt);
  }

  list(): Promise<Donation[]> {
    if (this.cached && this.cached.expires > this.now()) return this.cached.value;
    const value = this.client
      .postAll<StockCrowdTransaction>("/donors/v1/transactions", { id_campaigns: [this.campaignId] })
      .then((transactions) => transactions.map((t) => toDonation(t, this.salt)).filter((d): d is Donation => d !== null));
    this.cached = { expires: this.now() + this.ttlMs, value };
    value.catch(() => {
      this.cached = null;
    });
    return value;
  }
}
