#!/usr/bin/env node
/**
 * Freezes what the running app shows into one JSON file, so a static page can carry the
 * demo to a link that does not need the Meta token.
 *
 *   pnpm dev --port 3500      # in another shell
 *   node scripts/build-preview-data.mjs > preview/data.json
 *
 * Nothing personal travels: the Meta side is campaign-level spend and leads, and the donors
 * side is the pseudonymised table, which has no name, e-mail or record identifier.
 */

const BASE = process.env.PREVIEW_BASE || "http://localhost:3500";
const TODAY = process.env.PREVIEW_TODAY || new Date().toISOString().slice(0, 10);

/** Mirrors src/tracking/domain/campaigns.ts. The checks at the end hold the two in step. */
const CAMPAIGNS = [
  { key: "ImpulsaTalent", name: "Impulsa Talent", kind: "donatius", source: "impulsa" },
  { key: "Menopausa", name: "Menopausa", kind: "leads", source: "meta" },
];
const CONVENTION = /^(PER|VAL)\s+(\S+)/;

const DAY = 86_400_000;
const day = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const iso = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const pad = (x) => (x < 10 ? "0" : "") + x;
const ddmm = (n) => pad(new Date(n * DAY).getUTCDate()) + "/" + pad(new Date(n * DAY).getUTCMonth() + 1);
const weekStart = (n) => n - ((((n + 3) % 7) + 7) % 7);
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

const board = await (await fetch(`${BASE}/api/board?today=${TODAY}`)).json();
if (board.error) throw new Error(board.error);

const adCampaigns = new Map(board.meta.campaigns.map((c) => [c.id, c]));
const keyOf = (name) => {
  const match = CONVENTION.exec(name.trim());
  if (!match) return null;
  return CAMPAIGNS.find((c) => c.key.toLowerCase() === match[2].toLowerCase())?.key ?? null;
};

const series = (rows, granularity) => {
  const buckets = new Map();
  for (const row of rows) {
    const d = day(row.date);
    const start = granularity === "week" ? weekStart(d) : d;
    const bucket = buckets.get(start) ?? { spend: 0, results: 0 };
    bucket.spend += row.spend;
    bucket.results += row.results.lead ?? 0;
    buckets.set(start, bucket);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const points = [];
  const step = granularity === "week" ? 7 : 1;
  for (let k = keys[0]; k <= keys[keys.length - 1]; k += step) {
    const bucket = buckets.get(k) ?? { spend: 0, results: 0 };
    points.push({
      label: ddmm(k),
      longLabel: granularity === "week" ? `setmana del ${ddmm(k)} al ${ddmm(k + 6)}` : ddmm(k),
      spend: round(bucket.spend, 2),
      results: bucket.results,
      cost: bucket.results > 0 ? round(bucket.spend / bucket.results) : null,
    });
  }
  return points;
};

const campaigns = CAMPAIGNS.map((definition) => {
  if (definition.source !== "meta") return { ...definition };
  const rows = board.meta.rows.filter((row) => keyOf(adCampaigns.get(row.campaignId).name) === definition.key);
  const days = rows.map((r) => day(r.date));
  return {
    ...definition,
    range: { since: iso(Math.min(...days)), until: iso(Math.max(...days)) },
    totals: {
      spend: round(rows.reduce((t, r) => t + r.spend, 0), 2),
      results: rows.reduce((t, r) => t + (r.results.lead ?? 0), 0),
      linkClicks: rows.reduce((t, r) => t + r.linkClicks, 0),
      impressions: rows.reduce((t, r) => t + r.impressions, 0),
      days: new Set(rows.map((r) => r.date)).size,
    },
    series: { day: series(rows, "day"), week: series(rows, "week") },
  };
});

const snapshot = {
  generatedAt: new Date().toISOString(),
  today: TODAY,
  account: { name: board.account?.name ?? "Vall d’Hebron", currency: board.account?.currency ?? "USD" },
  window: board.window,
  campaigns,
  impulsa: board.impulsa,
  donors: board.donors,
};

// The snapshot must say the same thing as the sources it came from.
const fails = [];
const talent = board.impulsa;
if (talent.checks.some((c) => !c.ok)) fails.push("l’agregat d’Impulsa Talent no quadra amb el seu resum");
if (!board.donors?.records.length) fails.push("falten els registres de donants");
if (Object.keys(board.overrides ?? {}).length) fails.push("hi ha correccions manuals sense desar a la instantània; buideu data/impulsa-overrides.json o reviseu-les");
for (const campaign of campaigns.filter((c) => c.source === "meta")) {
  const fromSeries = campaign.series.day.reduce((t, p) => t + p.results, 0);
  if (fromSeries !== campaign.totals.results) fails.push(`${campaign.name}: la sèrie diària no suma el total de leads`);
  if (!campaign.totals.spend) fails.push(`${campaign.name}: no té inversió a la instantània`);
}
if (fails.length) {
  console.error("La instantània no quadra:\n  " + fails.join("\n  "));
  process.exit(1);
}

process.stdout.write(JSON.stringify(snapshot));
console.error(`Instantània de ${campaigns.length} campanyes i ${board.donors.records.length} registres · ${TODAY} · totes les comprovacions passen.`);
