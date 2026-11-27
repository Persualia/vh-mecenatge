"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clampRange, presetRange, RANGE_PRESETS, toDayNumber, type Granularity } from "@/tracking/domain/calendar";
import { buildCampaigns } from "@/tracking/domain/campaigns";
import { donorTotals, resolveRows, yearColumns, type DonorOverride, type DonorOverrides } from "@/tracking/domain/donors";
import { int, isoToCa } from "@/tracking/domain/format";
import { buildLeadsReport } from "@/tracking/domain/leads-report";
import type { TrackingBoard } from "@/tracking/application/load-tracking-board";
import { CampaignSelect, GranularityToggle, RangeFilter, TabBar } from "./controls";
import { DonorsTable } from "./donors-table";
import { ImpulsaView } from "./impulsa-view";
import { LeadsView } from "./leads-view";

const dateTime = (iso: string) => new Date(iso).toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" });
/** The board is as old as its oldest source. */
const oldest = (sources: { savedAt: string }[]) => sources.map((s) => s.savedAt).sort()[0];

const SOURCE_LABEL = { meta: "Meta Ads", impulsa: "Socis i donatius" } as const;
type Tab = "resum" | "donants";

export function Board({
  board,
  onRefresh,
  refreshing,
  refreshError,
}: {
  board: TrackingBoard;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
}) {
  const { campaigns, outOfScope } = useMemo(() => buildCampaigns({ dataset: board.meta }), [board.meta]);

  const [selected, setSelected] = useState(campaigns[0]?.key ?? "");
  const [presetId, setPresetId] = useState("all");
  const [granularity, setGranularity] = useState<Granularity | null>(null);
  const [tab, setTab] = useState<Tab>("resum");

  // Corrections made in this session sit on top of what the server sent, so the figures move
  // the moment a cell changes rather than after a reload.
  const [overrides, setOverrides] = useState<DonorOverrides | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const effectiveOverrides = overrides ?? board.overrides;

  const saveOverride = useCallback(async (ref: string, override: DonorOverride) => {
    setSaving(ref);
    setSaveError(null);
    try {
      const response = await fetch("/api/donors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, override }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No s’ha pogut desar la correcció.");
      setOverrides(body.overrides);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No s’ha pogut desar la correcció.");
    } finally {
      setSaving(null);
    }
  }, []);

  const searchByEmail = useCallback(async (email: string) => {
    const response = await fetch("/api/donors/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "No s’ha pogut cercar el correu.");
    return body.refs as string[];
  }, []);

  const campaign = campaigns.find((c) => c.key === selected) ?? campaigns[0];
  const currency = board.account?.currency ?? "USD";
  const isDonations = campaign?.kind === "donatius";
  const hasMeta = !!campaign && campaign.adCampaigns.length > 0;

  const donors = board.donors;
  const years = useMemo(() => (donors ? yearColumns(donors.records, effectiveOverrides, board.today) : []), [donors, effectiveOverrides, board.today]);
  const totals = useMemo(
    () => (donors ? donorTotals(resolveRows(donors.records, effectiveOverrides, years, board.today), years, board.today) : null),
    [donors, effectiveOverrides, years, board.today],
  );

  const bounds = useMemo(
    () => (campaign?.firstDay && campaign.lastDay ? { since: campaign.firstDay, until: campaign.lastDay } : null),
    [campaign],
  );
  const preset = RANGE_PRESETS.find((p) => p.id === presetId) ?? RANGE_PRESETS[0];
  const range = bounds ? presetRange(preset, bounds) : null;

  // Days read well up to about a month; past that the daily noise hides the trend.
  const span = range ? toDayNumber(range.until) - toDayNumber(range.since) + 1 : 0;
  const grouping: Granularity = granularity ?? (span <= 35 ? "day" : "week");

  const report = useMemo(
    () => (campaign && hasMeta && range && bounds ? buildLeadsReport({ dataset: board.meta, campaign, range: clampRange(range, bounds), granularity: grouping, currency }) : null),
    [board.meta, campaign, hasMeta, range, bounds, grouping, currency],
  );

  if (!campaign) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cap campanya per mostrar</AlertTitle>
        <AlertDescription>No hi ha cap campanya de l’abast de la demo amb dades al període carregat.</AlertDescription>
      </Alert>
    );
  }

  const lastUpdate = isDonations
    ? board.impulsa
      ? `${board.impulsa.source.kind === "live" ? "StockCrowd" : "Fitxer de socis i donatius"} a ${isoToCa(board.impulsa.cutOff)}`
      : ""
    : campaign.lastDay
      ? `Meta Ads a ${isoToCa(campaign.lastDay)}`
      : "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">VHIR · Unitat de Mecenatge</p>
            <h1 className="font-heading mt-0.5 text-xl font-semibold sm:text-2xl">Quadre de seguiment de campanyes</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {board.account ? `${board.account.name} · ${board.account.currency}` : "Compte de Meta Ads"}
              <br />
              <span title={board.sources.map((s) => `${s.label}: ${dateTime(s.savedAt)}`).join("\n")}>
                {board.sources.length ? `Dades llegides ${dateTime(oldest(board.sources))}` : `Lectura ${dateTime(board.loadedAt)}`}
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="flex-none">
              <RefreshCwIcon className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
              Actualitza
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <CampaignSelect campaigns={campaigns} value={campaign.key} onChange={setSelected} />
          {/* A donations campaign is a snapshot at its cut-off date; there is nothing to slice. */}
          {hasMeta && <RangeFilter presets={RANGE_PRESETS} value={presetId} onChange={setPresetId} />}
          {hasMeta && <GranularityToggle value={grouping} onChange={setGranularity} />}
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="font-heading text-lg font-semibold">{campaign.name}</h2>
          <Badge variant="outline">{SOURCE_LABEL[campaign.source]}</Badge>
          {lastUpdate && <span className="text-xs text-muted-foreground">Dades actualitzades: {lastUpdate}</span>}
        </div>
        {campaign.aliasNote && <p className="max-w-3xl rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-ink-secondary">{campaign.aliasNote}</p>}
      </section>

      {refreshError && (
        <Alert variant="destructive">
          <AlertTitle>No s’ha pogut actualitzar</AlertTitle>
          <AlertDescription>{refreshError} Es continuen mostrant les dades desades.</AlertDescription>
        </Alert>
      )}

      {board.sources
        .filter((source) => source.error)
        .map((source) => (
          <Alert key={source.label}>
            <AlertTitle>
              {source.label}: dades del {dateTime(source.savedAt)}
            </AlertTitle>
            <AlertDescription>{source.error}</AlertDescription>
          </Alert>
        ))}

      {board.failures.map((failure) => (
        <Alert key={failure.source} variant="destructive">
          <AlertTitle>No s’ha pogut llegir {failure.source === "meta" ? "Meta Ads" : "les dades d’Impulsa Talent"}</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ))}

      {isDonations && board.impulsa && totals && donors && (
        <>
          <TabBar
            tabs={[
              { id: "resum" as const, label: "Resum" },
              { id: "donants" as const, label: `Donants i socis (${int(donors.records.length)})` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "resum" ? (
            <ImpulsaView aggregate={board.impulsa} totals={totals} />
          ) : (
            <DonorsTable records={donors.records} overrides={effectiveOverrides} today={board.today} onSave={saveOverride} saving={saving} error={saveError} searchByEmail={searchByEmail} />
          )}
        </>
      )}

      {!isDonations && report && <LeadsView report={report} />}

      {!isDonations && !report && (
        <Alert>
          <AlertTitle>Sense dades per a aquesta campanya</AlertTitle>
          <AlertDescription>No hi ha publicació de Meta Ads dins del període carregat.</AlertDescription>
        </Alert>
      )}

      <footer className="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Demo de seguiment amb dades reals: Meta Ads des de la Graph API i Impulsa Talent {board.impulsa?.source.kind === "live" ? "des de StockCrowd" : "des de l’agregat del fitxer"}. El quadre s’obre amb l’última lectura desada de cada API; «Actualitza» les torna a llegir. Es carrega un any de dades diàries ({isoToCa(board.window.since)} – {isoToCa(board.window.until)}) i els
          càlculs es fan al navegador, de manera que canviar de campanya, de període o d’agrupació és immediat.
        </p>
        {outOfScope > 0 && <p>El compte de Meta té {int(outOfScope)} campanyes més que ara no entren en l’abast de la demo.</p>}
        {board.impulsa && donors && (
          <p>
            Font d’Impulsa Talent: {board.impulsa.source.file} ({board.impulsa.source.detailRows} registres, {board.impulsa.source.includedRows} computables, a {isoToCa(board.impulsa.cutOff)}). {board.impulsa.source.note}
          </p>
        )}
      </footer>
    </div>
  );
}
