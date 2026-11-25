import { dataWindow } from "@/tracking/domain/calendar";
import type { AdAccount, DateRange, InsightsDataset } from "@/tracking/domain/dataset";
import type { DonorOverrides, DonorRecordsFile } from "@/tracking/domain/donors";
import type { ImpulsaAggregate } from "@/tracking/domain/impulsa";
import type { AdAccountRepository } from "./ports/ad-account-repository";
import type { CampaignInsightsRepository, FetchOptions } from "./ports/campaign-insights-repository";
import type { ImpulsaRepository } from "./ports/impulsa-repository";
import type { DonorOverridesRepository } from "./ports/donor-overrides-repository";

export class InvalidRequestError extends Error {}

export interface SourceFailure {
  source: "meta" | "impulsa";
  message: string;
}

export interface TrackingBoard {
  /** The day the board is read, so recency decides what is still active. */
  today: string;
  /** Daily Meta data the browser recalculates any period from. */
  window: DateRange;
  account: AdAccount | null;
  meta: InsightsDataset;
  impulsa: ImpulsaAggregate | null;
  /** One row per record for the editable table, and the hand corrections made to them. */
  donors: DonorRecordsFile | null;
  overrides: DonorOverrides;
  /** A source that could not be read: the board is partial when there are any. */
  failures: SourceFailure[];
  loadedAt: string;
}

/**
 * One read for the whole board. A year of daily rows goes to the browser, where pure
 * domain code recalculates the cards, the charts and the date filter without a round
 * trip; the Impulsa Talent figures ride along as the aggregate.
 */
export class LoadTrackingBoard {
  constructor(
    private readonly accounts: AdAccountRepository,
    private readonly insights: CampaignInsightsRepository,
    private readonly impulsa: ImpulsaRepository,
    private readonly overrides: DonorOverridesRepository,
    private readonly accountId: string,
  ) {}

  async execute(today: string, options?: FetchOptions): Promise<TrackingBoard> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new InvalidRequestError("La data d’avui no és vàlida.");
    if (!/^\d+$/.test(this.accountId)) throw new InvalidRequestError("El compte publicitari configurat no és vàlid.");

    const window = dataWindow(today);
    const [account, meta, impulsa, donors, overrides] = await Promise.allSettled([
      this.accounts.listAll().then((list) => list.find((a) => a.id === this.accountId) ?? null),
      this.insights.fetchDaily(this.accountId, window, options),
      this.impulsa.load(),
      this.impulsa.loadRecords(),
      this.overrides.load(),
    ]);

    const failures: SourceFailure[] = [];
    const reason = (result: PromiseRejectedResult) => (result.reason instanceof Error ? result.reason.message : String(result.reason));
    if (account.status === "rejected") failures.push({ source: "meta", message: reason(account) });
    if (meta.status === "rejected") failures.push({ source: "meta", message: reason(meta) });
    for (const result of [impulsa, donors, overrides]) {
      if (result.status === "rejected") failures.push({ source: "impulsa", message: reason(result) });
    }

    // Meta is the only source the board cannot be drawn without.
    if (meta.status === "rejected") throw new Error(reason(meta));

    return {
      today,
      window,
      account: account.status === "fulfilled" ? account.value : null,
      meta: meta.value,
      impulsa: impulsa.status === "fulfilled" ? impulsa.value : null,
      donors: donors.status === "fulfilled" ? donors.value : null,
      overrides: overrides.status === "fulfilled" ? overrides.value : {},
      failures,
      loadedAt: new Date().toISOString(),
    };
  }
}
