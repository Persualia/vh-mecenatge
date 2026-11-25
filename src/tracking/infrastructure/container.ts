import "server-only";
import { LoadTrackingBoard } from "@/tracking/application/load-tracking-board";
import { CachedCampaignInsightsRepository } from "./cache/cached-campaign-insights-repository";
import { SaveDonorOverride } from "@/tracking/application/save-donor-override";
import { BundledImpulsaRepository } from "./impulsa/bundled-impulsa-repository";
import { FileDonorOverridesRepository } from "./impulsa/file-donor-overrides-repository";
import { GraphClient } from "./meta/graph-client";
import { MetaAdAccountRepository } from "./meta/meta-ad-account-repository";
import { MetaCampaignInsightsRepository } from "./meta/meta-campaign-insights-repository";

const PERSUALIA_BUSINESS_ID = "390444695046981";
/** Vall d'Hebron, the VHIR ad account inside Persualia's Business Manager. */
const VHIR_AD_ACCOUNT_ID = "122669428442042";
const INSIGHTS_TTL_MS = 30 * 60_000;

function build() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta META_ACCESS_TOKEN. Mireu el README: es llegeix del .env de les credencials compartides.");

  const graph = new GraphClient({ accessToken, version: process.env.META_API_VERSION || "v25.0", concurrency: 4 });
  const accounts = new MetaAdAccountRepository(graph, process.env.META_BUSINESS_ID || PERSUALIA_BUSINESS_ID);
  const insights = new CachedCampaignInsightsRepository(new MetaCampaignInsightsRepository(graph), INSIGHTS_TTL_MS);

  const impulsa = new BundledImpulsaRepository();
  const overrides = new FileDonorOverridesRepository();

  return {
    loadTrackingBoard: new LoadTrackingBoard(accounts, insights, impulsa, overrides, process.env.VHIR_AD_ACCOUNT_ID || VHIR_AD_ACCOUNT_ID),
    saveDonorOverride: new SaveDonorOverride(impulsa, overrides),
  };
}

// On globalThis so the cache survives dev hot reloads.
const holder = globalThis as unknown as { vhirTracking?: ReturnType<typeof build> };

export const container = () => (holder.vhirTracking ??= build());
