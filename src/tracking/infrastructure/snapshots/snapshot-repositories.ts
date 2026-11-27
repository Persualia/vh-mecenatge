import type { AdAccountRepository } from "@/tracking/application/ports/ad-account-repository";
import type { CampaignInsightsRepository } from "@/tracking/application/ports/campaign-insights-repository";
import type { CampaignSpendRepository } from "@/tracking/application/ports/campaign-spend-repository";
import type { DonationsRepository } from "@/tracking/application/ports/donations-repository";
import type { FetchOptions } from "@/tracking/application/ports/fetch-options";
import type { SnapshotStore } from "@/tracking/application/ports/snapshot-store";
import type { AdAccount, DateRange, InsightsDataset } from "@/tracking/domain/dataset";
import type { Donation } from "@/tracking/domain/donations";
import type { CampaignSpend } from "@/tracking/domain/impulsa";
import { SnapshottedSource } from "./snapshotted-source";

/*
 * Each API behind its saved copy. The copy keeps what the API returned, not the board built from
 * it: the board depends on the day it is read, so it is rebuilt from the copies every time.
 */

export class SnapshotAdAccountRepository implements AdAccountRepository {
  private readonly source: SnapshottedSource<AdAccount[]>;

  constructor(
    private readonly live: AdAccountRepository,
    store: SnapshotStore,
  ) {
    this.source = new SnapshottedSource(store, { name: "meta-ad-accounts", label: "Meta Ads (comptes)", source: "meta" });
  }

  listAll(options?: FetchOptions): Promise<AdAccount[]> {
    return this.source.read(() => this.live.listAll(), options);
  }
}

/** The copy holds the window it was read with; until the next refresh, that is the board's year. */
export class SnapshotCampaignInsightsRepository implements CampaignInsightsRepository {
  private readonly sources = new Map<string, SnapshottedSource<InsightsDataset>>();

  constructor(
    private readonly live: CampaignInsightsRepository,
    private readonly store: SnapshotStore,
  ) {}

  fetchDaily(accountId: string, range: DateRange, options?: FetchOptions): Promise<InsightsDataset> {
    let source = this.sources.get(accountId);
    if (!source) {
      source = new SnapshottedSource(this.store, { name: `meta-insights-${accountId}`, label: "Meta Ads", source: "meta" });
      this.sources.set(accountId, source);
    }
    return source.read(() => this.live.fetchDaily(accountId, range), options);
  }
}

export class SnapshotDonationsRepository implements DonationsRepository {
  private readonly source: SnapshottedSource<Donation[]>;

  constructor(
    private readonly live: DonationsRepository,
    store: SnapshotStore,
    name: string,
  ) {
    this.source = new SnapshottedSource(store, { name, label: "StockCrowd", source: "impulsa" });
  }

  get sourceName() {
    return this.live.sourceName;
  }

  keyFor(email: string): string {
    return this.live.keyFor(email);
  }

  list(options?: FetchOptions): Promise<Donation[]> {
    return this.source.read(() => this.live.list(), options);
  }
}

export class SnapshotCampaignSpendRepository implements CampaignSpendRepository {
  private readonly source: SnapshottedSource<{ currency: string; campaigns: CampaignSpend[] }>;

  constructor(
    private readonly live: CampaignSpendRepository,
    store: SnapshotStore,
    name: string,
    label: string,
  ) {
    this.source = new SnapshottedSource(store, { name, label, source: "impulsa" });
  }

  spendByCampaign(range: DateRange, options?: FetchOptions) {
    return this.source.read(() => this.live.spendByCampaign(range), options);
  }
}
