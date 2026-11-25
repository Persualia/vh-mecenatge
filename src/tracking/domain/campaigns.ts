import { toDayNumber, toIso } from "./calendar";
import type { Campaign, InsightsDataset } from "./dataset";

/**
 * Internal naming convention of the Unitat de Mecenatge: `PER <X> <audience…> v<n>`, where X
 * names the campaign. The Impulsa Talent campaign was opened with the `VAL` prefix instead,
 * so both are read.
 */
const CONVENTION = /^(PER|VAL)\s+(\S+)/;

/** What the campaign measures, which decides the whole view. */
export type CampaignKind = "leads" | "donatius";

export type SourceKind = "meta" | "impulsa";

export interface CampaignDefinition {
  /** Token X of the convention, after resolving the aliases. */
  key: string;
  /** The only name the selector shows. */
  name: string;
  kind: CampaignKind;
  /** Where its figures come from. A donations campaign reads the socis i donatius file only. */
  source: SourceKind;
  /** Other tokens in Meta that mean this same campaign. */
  aliases?: string[];
  aliasNote?: string;
}

export const KIND_LABEL: Record<CampaignKind, string> = {
  leads: "Campanyes de leads",
  donatius: "Campanyes de donatius i socis",
};

/**
 * The campaigns the demo shows, in selector order. This list is the scope: the account holds
 * many more campaigns in Meta, and adding one here is what brings it into the board.
 */
export const CAMPAIGNS: CampaignDefinition[] = [
  { key: "ImpulsaTalent", name: "Impulsa Talent", kind: "donatius", source: "impulsa" },
  { key: "Menopausa", name: "Menopausa", kind: "leads", source: "meta" },
];

const DEFINITION_BY_TOKEN = new Map<string, CampaignDefinition>();
for (const definition of CAMPAIGNS) {
  for (const token of [definition.key, ...(definition.aliases ?? [])]) DEFINITION_BY_TOKEN.set(token.toLowerCase(), definition);
}

/** The campaign a Meta ad campaign belongs to, or null when it is outside the demo's scope. */
export function campaignOf(adCampaignName: string): CampaignDefinition | null {
  const match = CONVENTION.exec(adCampaignName.trim());
  if (!match) return null;
  return DEFINITION_BY_TOKEN.get(match[2].toLowerCase()) ?? null;
}

export interface BoardCampaign extends CampaignDefinition {
  /** The Meta ad campaigns in the group. Empty for a donations campaign. */
  adCampaigns: Campaign[];
  /** Days with delivery in Meta. */
  firstDay: string | null;
  lastDay: string | null;
}

export interface CampaignsBoard {
  campaigns: BoardCampaign[];
  /** Ad campaigns in the account that this demo does not cover. */
  outOfScope: number;
}

export interface BuildCampaignsInput {
  dataset: InsightsDataset;
}

/** Groups the account's ad campaigns into the campaigns the board shows. */
export function buildCampaigns({ dataset }: BuildCampaignsInput): CampaignsBoard {
  const daysOf = new Map<string, { first: number; last: number }>();
  for (const row of dataset.rows) {
    const day = toDayNumber(row.date);
    const span = daysOf.get(row.campaignId);
    daysOf.set(row.campaignId, span ? { first: Math.min(span.first, day), last: Math.max(span.last, day) } : { first: day, last: day });
  }

  const groups = new Map<string, Campaign[]>();
  let outOfScope = 0;
  for (const adCampaign of dataset.campaigns) {
    const definition = campaignOf(adCampaign.name);
    // A donations campaign takes nothing from Meta: its figures come from the file.
    if (!definition || definition.source !== "meta") {
      outOfScope++;
      continue;
    }
    groups.set(definition.key, [...(groups.get(definition.key) ?? []), adCampaign]);
  }

  const campaigns = CAMPAIGNS.map((definition) => {
    const adCampaigns = groups.get(definition.key) ?? [];
    const spans = adCampaigns.flatMap((c) => daysOf.get(c.id) ?? []);
    return {
      ...definition,
      adCampaigns,
      firstDay: spans.length ? toIso(Math.min(...spans.map((s) => s.first))) : null,
      lastDay: spans.length ? toIso(Math.max(...spans.map((s) => s.last))) : null,
    };
  });

  return { campaigns, outOfScope };
}

/** The selector's two groups, in order, leaving out a group with nothing in it. */
export function campaignGroups(campaigns: BoardCampaign[]): { kind: CampaignKind; label: string; campaigns: BoardCampaign[] }[] {
  return (["leads", "donatius"] as CampaignKind[])
    .map((kind) => ({ kind, label: KIND_LABEL[kind], campaigns: campaigns.filter((c) => c.kind === kind) }))
    .filter((group) => group.campaigns.length > 0);
}
