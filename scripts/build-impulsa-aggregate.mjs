#!/usr/bin/env node
/**
 * Aggregates the Impulsa Talent export into the only file the app ever serves.
 *
 *   pnpm data:impulsa "<ruta>/VAL ImpulsaTalent Socis i Donatius - 2026.csv"
 *
 * The export carries names, e-mail addresses and record identifiers. None of them
 * cross into the output: this script reads only the date, the amount, the
 * frequency, the state and the channel of each row, and writes counts and sums.
 * The original CSV stays outside the repository (see .gitignore) and outside the
 * browser; the app imports the generated JSON and nothing else.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";

const OUT = resolve(import.meta.dirname, "..", "src/tracking/data/impulsa-aggregate.json");
const OUT_RECORDS = resolve(import.meta.dirname, "..", "src/tracking/data/impulsa-records.json");

/** Criterion printed in the export: what one year of a recurring gift is worth. */
const MULTIPLIER = { Mensual: 12, Trimestral: 4, Anual: 1, Puntual: 1 };
const RECURRING = ["Mensual", "Trimestral", "Anual"];

/** The export marks a row as counting with this state; anything else is left out of every sum. */
const INCLUDED = "Inclòs";

/**
 * The export writes the cancelled state in lower case and without the accent. The table
 * offers a fixed set of states, so the value is normalised here rather than in the browser,
 * where a state that matched no option would silently show as the first one.
 */
const STATES = ["Inclòs", "Exclòs", "Cancel·lada"];
function normaliseState(raw) {
  const value = raw.trim();
  const known = STATES.find((state) => state.toLowerCase() === value.toLowerCase());
  if (known) return known;
  if (/^cancel/i.test(value)) return "Cancel·lada";
  if (/^excl/i.test(value)) return "Exclòs";
  return value;
}

/**
 * Traffic source of each row. The export only writes a channel when it is not Meta, so an
 * empty cell means Meta: that is the rule the Unitat de Mecenatge works with, and it is what
 * the export's own per-channel ROAS already assumes.
 */
const CHANNELS = {
  Google: { key: "google", label: "Google Ads" },
  NL: { key: "newsletter", label: "Newsletter" },
  "": { key: "meta", label: "Meta" },
};
const DEFAULT_CHANNEL = "meta";

// ---------------------------------------------------------------- CSV reading

/** RFC 4180: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "€1,234.50", "$4,820.50", "2,196.70€" → 1234.5 — the export mixes all three. */
const money = (s) => {
  const n = Number(String(s).replace(/[€$\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "12/11/2026" → "2026-11-12". */
const isoDate = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) throw new Error(`Data no reconeguda: ${s}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/** Monday of the week a date falls in, as YYYY-MM-DD. */
const weekStart = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const round2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------- the build

function build(csvPath) {
  const raw = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(raw);

  // The export is two blocks: a summary at the top, then the header of the detail.
  const headerAt = rows.findIndex((r) => r[0].trim() === "Origen" && r[2].trim() === "Data");
  if (headerAt < 0) throw new Error("No s’ha trobat la capçalera del detall (Origen … Data).");
  const header = rows[headerAt].map((c) => c.trim());
  const col = (name) => {
    const i = header.findIndex((h) => h.startsWith(name));
    if (i < 0) throw new Error(`Falta la columna «${name}» al detall.`);
    return i;
  };
  const C = {
    origin: col("Origen"), date: col("Data"), base: col("Import base"),
    frequency: col("Freqüència"), multiplier: col("Multiplicador"), state: col("Estat"),
    billed: col("Facturació fins avui"), year: col("Total facturació primer any"),
    channel: col("Canal"), unpaid: col("Quotes impagades"),
  };

  // The summary block is a grid of label/value pairs; find each by its label.
  const head = rows.slice(0, headerAt);
  const labelled = (label) => {
    for (const r of head) {
      for (let i = 0; i < r.length - 1; i++) if (r[i].replace(/\s+/g, " ").trim() === label) return r[i + 1].trim();
    }
    throw new Error(`Falta «${label}» al resum del fitxer.`);
  };

  const declared = {
    yearValueEur: money(labelled("Total estimat primer any")),
    billedEur: money(labelled("Total facturat fins avui")),
    metaSpendUsd: money(labelled("Meta Inversió acumulada en $")),
    googleSpendEur: money(labelled("Google Inversió acumulada en €")),
    combinedSpendEur: money(labelled("Inversió acumulada en € aprox [Google i Meta]")),
    roasYear: Number(labelled("ROAS TOTAL estimat a l'any")),
    roasBilled: Number(labelled("ROAS TOTAL acumulat fins avui")),
    roasYearGoogle: Number(labelled("ROAS estimat a l'any de Google")),
    roasBilledGoogle: Number(labelled("ROAS estimat fins avui de Google")),
    roasYearMeta: Number(labelled("ROAS estimat a l'any de Meta")),
    roasBilledMeta: Number(labelled("ROAS estimat fins avui de Meta")),
    cutOff: isoDate(labelled("Ultim dia actualitzat:")),
  };

  const detail = rows.slice(headerAt + 1).filter((r) => r.some((c) => c.trim()));
  const records = detail.map((r) => ({
    origin: r[C.origin].trim(),
    date: isoDate(r[C.date]),
    base: money(r[C.base]),
    frequency: r[C.frequency].trim(),
    multiplier: Number(r[C.multiplier] || 1),
    state: normaliseState(r[C.state]),
    billed: money(r[C.billed]),
    year: money(r[C.year]),
    channel: r[C.channel].trim(),
    unpaid: r[C.unpaid].trim(),
  }));

  for (const r of records) if (!(r.frequency in MULTIPLIER)) throw new Error(`Freqüència desconeguda: ${r.frequency}`);
  const included = records.filter((r) => r.state === INCLUDED);
  const excluded = records.filter((r) => r.state !== INCLUDED);

  const sum = (list, field) => round2(list.reduce((t, r) => t + r[field], 0));
  const billedEur = sum(included, "billed");
  const yearValueEur = sum(included, "year");

  // --- checks against the source, so the app can show that it reconciles
  const byCriterion = round2(included.reduce((t, r) => t + r.base * MULTIPLIER[r.frequency], 0));
  const metaSpendEur = round2(declared.combinedSpendEur - declared.googleSpendEur);
  const attributedTo = (channel, field) => sum(included.filter((r) => r.channel === channel), field);
  const unattributedYear = attributedTo("", "year");
  const unattributedBilled = attributedTo("", "billed");

  const checks = [
    { id: "billed", label: "Facturació acumulada", computed: billedEur, declared: declared.billedEur },
    { id: "year", label: "Valor estimat el primer any", computed: yearValueEur, declared: declared.yearValueEur },
    { id: "criterion", label: "Import base × criteri = columna del primer any", computed: byCriterion, declared: declared.yearValueEur },
    { id: "roas-year", label: "Ràtio sobre la projecció a un any", computed: round2(yearValueEur / declared.combinedSpendEur), declared: declared.roasYear },
    { id: "roas-billed", label: "Ràtio sobre la facturació acumulada", computed: round2(billedEur / declared.combinedSpendEur), declared: declared.roasBilled },
    { id: "roas-google-year", label: "ROAS de Google a un any", computed: Math.round((attributedTo("Google", "year") / declared.googleSpendEur) * 1e6) / 1e6, declared: Math.round(declared.roasYearGoogle * 1e6) / 1e6 },
    { id: "roas-google-billed", label: "ROAS de Google acumulat", computed: Math.round((attributedTo("Google", "billed") / declared.googleSpendEur) * 1e6) / 1e6, declared: Math.round(declared.roasBilledGoogle * 1e6) / 1e6 },
    { id: "roas-meta-year", label: "ROAS de Meta a un any", computed: Math.round((unattributedYear / metaSpendEur) * 1e6) / 1e6, declared: Math.round(declared.roasYearMeta * 1e6) / 1e6 },
    { id: "roas-meta-billed", label: "ROAS de Meta acumulat", computed: Math.round((unattributedBilled / metaSpendEur) * 1e6) / 1e6, declared: Math.round(declared.roasBilledMeta * 1e6) / 1e6 },
  ].map((c) => ({ ...c, ok: Math.abs(c.computed - c.declared) <= 0.011 }));

  // Meta's own figures: the rows with no channel written, which are Meta's.
  const metaBasis = {
    spendEur: metaSpendEur,
    yearEur: unattributedYear,
    billedEur: unattributedBilled,
    roasYear: round2(unattributedYear / metaSpendEur),
    roasBilled: round2(unattributedBilled / metaSpendEur),
    reproducesYear: Math.abs(unattributedYear / metaSpendEur - declared.roasYearMeta) < 1e-6,
    reproducesBilled: Math.abs(unattributedBilled / metaSpendEur - declared.roasBilledMeta) < 1e-6,
  };

  // --- breakdowns
  const group = (list, keyOf) => {
    const out = new Map();
    for (const r of list) {
      const k = keyOf(r);
      const g = out.get(k) ?? { count: 0, billedEur: 0, yearEur: 0 };
      g.count++; g.billedEur += r.billed; g.yearEur += r.year;
      out.set(k, g);
    }
    return out;
  };

  const attribution = [...group(included, (r) => r.channel)]
    .map(([channel, g]) => ({ ...(CHANNELS[channel] ?? { key: channel.toLowerCase(), label: channel }), count: g.count, billedEur: round2(g.billedEur), yearEur: round2(g.yearEur) }))
    .sort((a, b) => b.yearEur - a.yearEur);

  const frequency = Object.keys(MULTIPLIER)
    .map((key) => ({ key, multiplier: MULTIPLIER[key], recurring: RECURRING.includes(key), ...(group(included, (r) => r.frequency).get(key) ?? { count: 0, billedEur: 0, yearEur: 0 }) }))
    .map((f) => ({ ...f, billedEur: round2(f.billedEur), yearEur: round2(f.yearEur) }))
    .filter((f) => f.count > 0);

  const origin = [...group(included, (r) => r.origin)]
    .map(([key, g]) => ({ key, count: g.count, billedEur: round2(g.billedEur), yearEur: round2(g.yearEur) }))
    .sort((a, b) => b.count - a.count);

  // --- weekly series by registration date
  const weeks = new Map();
  for (const r of included) {
    const k = weekStart(r.date);
    const w = weeks.get(k) ?? { weekStart: k, oneOffCount: 0, oneOffEur: 0, recurringCount: 0, recurringEur: 0, yearEur: 0 };
    if (r.frequency === "Puntual") { w.oneOffCount++; w.oneOffEur += r.billed; } else { w.recurringCount++; w.recurringEur += r.billed; }
    w.yearEur += r.year;
    weeks.set(k, w);
  }
  // Weeks with no registration are real zeros, not gaps: fill them in.
  const sorted = [...weeks.keys()].sort();
  const weekly = [];
  for (let d = new Date(sorted[0] + "T00:00:00Z"), end = new Date(sorted[sorted.length - 1] + "T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    const k = d.toISOString().slice(0, 10);
    const w = weeks.get(k) ?? { weekStart: k, oneOffCount: 0, oneOffEur: 0, recurringCount: 0, recurringEur: 0, yearEur: 0 };
    weekly.push({ ...w, oneOffEur: round2(w.oneOffEur), recurringEur: round2(w.recurringEur), yearEur: round2(w.yearEur) });
  }

  const dates = included.map((r) => r.date).sort();

  /**
   * One row per record for the editable table, with no name, e-mail or record identifier:
   * the reference is this file's own running number. The names stay in the export, which
   * never leaves the Unitat de Mecenatge.
   */
  const byDate = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const table = byDate.map((r, i) => ({
    ref: `R-${String(i + 1).padStart(3, "0")}`,
    date: r.date,
    system: r.origin,
    channel: (CHANNELS[r.channel] ?? { key: r.channel.toLowerCase() }).key,
    base: r.base,
    frequency: r.frequency,
    instalments: MULTIPLIER[r.frequency],
    recurring: RECURRING.includes(r.frequency),
    state: r.state,
    included: r.state === INCLUDED,
    billedEur: r.billed,
    firstYearEur: r.year,
  }));

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: {
      file: basename(csvPath),
      sha256: createHash("sha256").update(raw).digest("hex").slice(0, 16),
      detailRows: records.length,
      includedRows: included.length,
      note: "Agregat sense noms, correus ni identificadors. La font no entra al repositori ni al navegador.",
    },
    cutOff: declared.cutOff,
    criterion: MULTIPLIER,
    cards: {
      spendEur: declared.combinedSpendEur,
      metaSpendUsd: declared.metaSpendUsd,
      googleSpendEur: declared.googleSpendEur,
      metaSpendEur,
      impliedUsdToEur: Math.round((metaSpendEur / declared.metaSpendUsd) * 1e4) / 1e4,
      billedEur,
      yearValueEur,
      ratioBilled: declared.roasBilled,
      ratioYear: declared.roasYear,
    },
    attribution,
    frequency,
    origin,
    excluded: {
      count: excluded.length,
      reasons: [...group(excluded, (r) => r.state)].map(([state, g]) => ({ state, count: g.count })),
      billedEur: sum(excluded, "billed"),
      yearEur: sum(excluded, "year"),
    },
    unpaidQuotas: { rowsWithValue: records.filter((r) => r.unpaid).length, note: "La columna «Quotes impagades» és buida a tot el fitxer: no resta res dels totals." },
    weekly,
    registrations: { first: dates[0], last: dates[dates.length - 1], count: included.length },
    checks,
    metaChannelRoasBasis: metaBasis,
    declared,
    table,
  };
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Ús: pnpm data:impulsa \"<ruta del CSV d'Impulsa Talent>\"");
  process.exit(1);
}
const aggregate = build(resolve(csvPath));
mkdirSync(dirname(OUT), { recursive: true });
const { table, ...summary } = aggregate;
writeFileSync(OUT, JSON.stringify(summary, null, 2) + "\n");
writeFileSync(OUT_RECORDS, JSON.stringify({ generatedAt: summary.generatedAt, sourceSha256: summary.source.sha256, defaultChannel: DEFAULT_CHANNEL, records: table }, null, 2) + "\n");

const failed = aggregate.checks.filter((c) => !c.ok);
console.log(`Escrit ${OUT}`);
console.log(`Escrit ${OUT_RECORDS} · ${table.length} files sense dades personals`);
console.log(`  ${aggregate.source.detailRows} files de detall · ${aggregate.source.includedRows} incloses · ${aggregate.excluded.count} excloses`);
console.log(`  ${aggregate.weekly.length} setmanes, de ${aggregate.registrations.first} a ${aggregate.registrations.last}`);
for (const c of aggregate.checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.label}: ${c.computed} (fitxer: ${c.declared})`);
if (failed.length) { console.error(`\n${failed.length} comprovacions no quadren amb la font.`); process.exit(1); }
