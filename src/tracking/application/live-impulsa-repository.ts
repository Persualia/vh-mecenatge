import { dataWindow } from "@/tracking/domain/calendar";
import { donorRecordsFromDonations, refsOfDonor } from "@/tracking/domain/donations";
import type { DonorRecordsFile } from "@/tracking/domain/donors";
import { buildImpulsaAggregate, campaignSpend, sumCampaignSpend, type ImpulsaAggregate } from "@/tracking/domain/impulsa";
import type { CampaignInsightsRepository } from "./ports/campaign-insights-repository";
import type { CampaignSpendRepository } from "./ports/campaign-spend-repository";
import type { DonationsRepository } from "./ports/donations-repository";
import type { ImpulsaRepository } from "./ports/impulsa-repository";

export interface LiveImpulsaSettings {
  /** The Meta ad account the campaign runs in, and which of its campaigns are this one. */
  accountId: string;
  belongsToCampaign: (adCampaignName: string) => boolean;
  /**
   * Google Ads, when its credentials are configured. Without them, `googleSpendEur` is the
   * figure someone keeps up to date by hand.
   */
  googleAds: CampaignSpendRepository | null;
  googleSpendEur: number;
  usdToEur: number;
}

/**
 * Impulsa Talent read live: the records from the donations platform, Meta's spend from the
 * Graph API through the same cached port the board uses, so both reads share one request.
 */
export class LiveImpulsaRepository implements ImpulsaRepository {
  constructor(
    private readonly donations: DonationsRepository,
    private readonly insights: CampaignInsightsRepository,
    private readonly settings: LiveImpulsaSettings,
  ) {}

  async loadRecords(today: string): Promise<DonorRecordsFile> {
    const records = donorRecordsFromDonations(await this.donations.list(), today);
    return { generatedAt: today, sourceSha256: "", defaultChannel: "meta", records };
  }

  async findRefsByEmail(email: string, today: string): Promise<string[]> {
    return refsOfDonor(await this.donations.list(), this.donations.keyFor(email), today);
  }

  async load(today: string): Promise<ImpulsaAggregate> {
    const window = dataWindow(today);
    const [file, dataset, google] = await Promise.all([
      this.loadRecords(today),
      this.insights.fetchDaily(this.settings.accountId, window),
      this.settings.googleAds?.spendByCampaign(window) ?? null,
    ]);
    if (google && google.currency !== "EUR") throw new Error(`El compte de Google Ads és en ${google.currency}; el quadre espera euros.`);
    return buildImpulsaAggregate({
      records: file.records,
      spend: {
        metaSpendUsd: campaignSpend(dataset, this.settings.belongsToCampaign),
        googleSpendEur: google ? sumCampaignSpend(google.campaigns, this.settings.belongsToCampaign) : this.settings.googleSpendEur,
        googleSource: google ? "live" : "fixed",
        usdToEur: this.settings.usdToEur,
      },
      today,
      sourceName: this.donations.sourceName,
    });
  }
}
