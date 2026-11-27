import "server-only";
import type { DonationsRepository } from "@/tracking/application/ports/donations-repository";
import type { Donation } from "@/tracking/domain/donations";
import type { StockCrowdClient } from "./stockcrowd-client";
import { donorKeyOf, toDonation, type StockCrowdTransaction } from "./transaction-mapper";

/** The campaign's transactions on StockCrowd. Kept between reads by the snapshot in front of it. */
export class StockCrowdDonationsRepository implements DonationsRepository {
  constructor(
    private readonly client: StockCrowdClient,
    private readonly campaignId: number,
    readonly sourceName: string,
    /** Key of the e-mail hash. Fixed, so a hash means the same donor across restarts. */
    private readonly salt: string,
  ) {}

  keyFor(email: string): string {
    return donorKeyOf(email, this.salt);
  }

  async list(): Promise<Donation[]> {
    const transactions = await this.client.postAll<StockCrowdTransaction>("/donors/v1/transactions", { id_campaigns: [this.campaignId] });
    return transactions.map((t) => toDonation(t, this.salt)).filter((d): d is Donation => d !== null);
  }
}
