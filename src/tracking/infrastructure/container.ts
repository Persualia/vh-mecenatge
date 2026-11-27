import "server-only";
import { LoadTrackingBoard } from "@/tracking/application/load-tracking-board";
import { SaveDonorOverride } from "@/tracking/application/save-donor-override";
import { SearchDonorsByEmail } from "@/tracking/application/search-donors-by-email";
import { BundledImpulsaRepository } from "./impulsa/bundled-impulsa-repository";
import { S3Client } from "@aws-sdk/client-s3";
import { FileDonorOverridesRepository } from "./impulsa/file-donor-overrides-repository";
import { OVERRIDES_FILE_NAME, S3DonorOverridesRepository } from "./impulsa/s3-donor-overrides-repository";
import type { DonorOverridesRepository } from "@/tracking/application/ports/donor-overrides-repository";
import type { SnapshotStore } from "@/tracking/application/ports/snapshot-store";
import { FileSnapshotStore } from "./snapshots/file-snapshot-store";
import { S3SnapshotStore } from "./snapshots/s3-snapshot-store";
import {
  SnapshotAdAccountRepository,
  SnapshotCampaignInsightsRepository,
  SnapshotCampaignSpendRepository,
  SnapshotDonationsRepository,
} from "./snapshots/snapshot-repositories";
import { GraphClient } from "./meta/graph-client";
import { MetaAdAccountRepository } from "./meta/meta-ad-account-repository";
import { MetaCampaignInsightsRepository } from "./meta/meta-campaign-insights-repository";
import { GoogleAdsSpendRepository } from "./google-ads/google-ads-spend-repository";
import { GoogleOAuth } from "./google-ads/google-oauth";
import { StockCrowdClient } from "./stockcrowd/stockcrowd-client";
import { StockCrowdDonationsRepository } from "./stockcrowd/stockcrowd-donations-repository";
import { LiveImpulsaRepository } from "@/tracking/application/live-impulsa-repository";
import type { ImpulsaRepository } from "@/tracking/application/ports/impulsa-repository";
import type { CampaignInsightsRepository } from "@/tracking/application/ports/campaign-insights-repository";
import type { CampaignSpendRepository } from "@/tracking/application/ports/campaign-spend-repository";
import { campaignOf } from "@/tracking/domain/campaigns";

const PERSUALIA_BUSINESS_ID = "390444695046981";
/** Vall d'Hebron, the VHIR ad account inside Persualia's Business Manager. */
const VHIR_AD_ACCOUNT_ID = "122669428442042";
/** «Amb tu investiguem», the StockCrowd campaign behind Impulsa Talent. */
const IMPULSA_STOCKCROWD_CAMPAIGN = 27041;
/** Without Google Ads credentials: the spend the sheet stated (to 19/11/2026), and its rate. */
const IMPULSA_GOOGLE_SPEND_EUR = 2196.7;
const USD_TO_EUR = 0.9137;

const numberFromEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} ha de ser un nombre positiu.`);
  return value;
};

/** Google Ads when every credential is there; otherwise null and the fixed figure is used. */
function googleAdsSource(snapshots: SnapshotStore): CampaignSpendRepository | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DEVELOPER_TOKEN, GOOGLE_ADS_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DEVELOPER_TOKEN || !GOOGLE_ADS_ID) return null;
  const live = new GoogleAdsSpendRepository(new GoogleOAuth(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN), {
    customerId: GOOGLE_ADS_ID,
    developerToken: GOOGLE_DEVELOPER_TOKEN,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || "v26",
  });
  return new SnapshotCampaignSpendRepository(live, snapshots, `google-ads-spend-${GOOGLE_ADS_ID.replace(/\D/g, "")}`, "Google Ads");
}

/** The key the donors' e-mails are hashed with. Long and random, or the hash is guessable. */
function emailHashKey(): string {
  const key = process.env.DONOR_EMAIL_HASH_KEY;
  if (!key || key.length < 32) throw new Error("Falta DONOR_EMAIL_HASH_KEY (mínim 32 caràcters). Mireu el README.");
  return key;
}

/**
 * Live from StockCrowd when its key is configured; otherwise the frozen export of the sheet,
 * so the board still works without it.
 */
function impulsaSource(insights: CampaignInsightsRepository, accountId: string, snapshots: SnapshotStore): ImpulsaRepository {
  const apiKey = process.env.STOCKCROWD_API_KEY;
  if (!apiKey) return new BundledImpulsaRepository();

  const campaignId = numberFromEnv("STOCKCROWD_CAMPAIGN_ID", IMPULSA_STOCKCROWD_CAMPAIGN);
  const client = new StockCrowdClient(process.env.STOCKCROWD_URL || "https://api.stockcrowd.com", apiKey);
  const live = new StockCrowdDonationsRepository(client, campaignId, `StockCrowd · campanya ${campaignId}`, emailHashKey());
  const donations = new SnapshotDonationsRepository(live, snapshots, `stockcrowd-donations-${campaignId}`);
  return new LiveImpulsaRepository(donations, insights, {
    accountId,
    belongsToCampaign: (name) => campaignOf(name)?.key === "ImpulsaTalent",
    googleAds: googleAdsSource(snapshots),
    googleSpendEur: numberFromEnv("IMPULSA_GOOGLE_SPEND_EUR", IMPULSA_GOOGLE_SPEND_EUR),
    usdToEur: numberFromEnv("USD_TO_EUR", USD_TO_EUR),
  });
}

/**
 * S3 when a bucket is configured, so the deployed app keeps no state of its own; otherwise the
 * JSON file in data/. The file versioned in git seeds the object the first time.
 * Credentials and region come from the standard AWS_* variables.
 */
function overridesSource(): DonorOverridesRepository {
  const file = new FileDonorOverridesRepository();
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return file;
  return new S3DonorOverridesRepository(new S3Client({}), bucket, `${s3Prefix()}${OVERRIDES_FILE_NAME}`, () => file.load());
}

/**
 * The last read of each API, so the board opens from it and only asks the APIs on "Actualitza".
 * Beside the corrections in S3 when there is a bucket; otherwise in data/snapshots/.
 */
function snapshotStore(): SnapshotStore {
  const bucket = process.env.AWS_S3_BUCKET;
  return bucket ? new S3SnapshotStore(new S3Client({}), bucket, s3Prefix()) : new FileSnapshotStore();
}

/** AWS_S3_PATH without a leading slash and with a trailing one, or empty. */
function s3Prefix(): string {
  const prefix = (process.env.AWS_S3_PATH ?? "").replace(/^\/+/, "");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function build() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta META_ACCESS_TOKEN. Mireu el README: es llegeix del .env de les credencials compartides.");

  const graph = new GraphClient({ accessToken, version: process.env.META_API_VERSION || "v25.0", concurrency: 4 });
  const snapshots = snapshotStore();
  const accounts = new SnapshotAdAccountRepository(new MetaAdAccountRepository(graph, process.env.META_BUSINESS_ID || PERSUALIA_BUSINESS_ID), snapshots);
  const insights = new SnapshotCampaignInsightsRepository(new MetaCampaignInsightsRepository(graph), snapshots);

  const accountId = process.env.VHIR_AD_ACCOUNT_ID || VHIR_AD_ACCOUNT_ID;
  const impulsa = impulsaSource(insights, accountId, snapshots);
  const overrides = overridesSource();

  return {
    loadTrackingBoard: new LoadTrackingBoard(accounts, insights, impulsa, overrides, accountId),
    saveDonorOverride: new SaveDonorOverride(impulsa, overrides),
    searchDonorsByEmail: new SearchDonorsByEmail(impulsa),
  };
}

// On globalThis so the shared reads survive dev hot reloads.
const holder = globalThis as unknown as { vhirTracking?: ReturnType<typeof build> };

export const container = () => (holder.vhirTracking ??= build());
