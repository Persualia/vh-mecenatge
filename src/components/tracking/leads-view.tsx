"use client";

import { rangeText } from "@/tracking/domain/calendar";
import { int, money } from "@/tracking/domain/format";
import { LEADS_COPY, type LeadsReport } from "@/tracking/domain/leads-report";
import { ColumnChart, LineChart } from "./charts";
import { MetricNotes } from "./metric-notes";
import { StatCard } from "./stat-card";

const compact = (value: number) => (Math.abs(value) >= 1000 ? `${int(value / 1000)} k` : int(value));

export function LeadsView({ report }: { report: LeadsReport }) {
  const { totals, currency, series, range, granularity } = report;
  const cash = (value: number | null, digits = 2) => money(value, currency, digits);
  const span = rangeText(range);
  const perPeriod = granularity === "day" ? "per dia" : "per setmana";
  const partial = series.some((p) => !p.complete) ? ` Les barres clares són ${granularity === "day" ? "dies" : "setmanes"} que el rang talla i no es poden comparar.` : "";

  const spendRow = (i: number) => [{ label: "Inversió", value: cash(series[i].spend) }];
  // Whole units once the axis reaches ten; cents below that. The same style for every tick.
  const topCost = Math.max(0, ...series.map((p) => p.costPerResult ?? 0));
  const axisMoney = (value: number) => cash(value, topCost >= 10 ? 0 : 2);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Xifres de la campanya" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Inversió" value={cash(totals.spend)} sub={`${int(totals.days)} dies amb publicació`} />
        <StatCard label={LEADS_COPY.option} value={int(totals.results)} sub={`${int(totals.impressions)} impressions`} />
        <StatCard
          label={LEADS_COPY.costLabel}
          value={cash(totals.costPerResult)}
          metric="cpl"
          sub={totals.results === 0 ? "Sense leads en aquest període" : `${cash(totals.spend, 0)} ÷ ${int(totals.results)} leads`}
          className="max-lg:col-span-2"
        />
      </section>

      <section aria-label="Lectura del període" className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-sm leading-relaxed text-pretty">{report.summary}</p>
        {report.change && <p className="mt-1.5 text-sm leading-relaxed text-pretty text-ink-secondary">{report.change}</p>}
      </section>

      {/* Volume and cost on separate charts: one scale each, so neither distorts the other. */}
      <section aria-label="Evolució" className="grid gap-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:grid-cols-2">
        <ColumnChart
          title={`Leads ${perPeriod}`}
          caption={`Volum dels leads, ${span}.${partial}`}
          seriesLabel={LEADS_COPY.option}
          points={series.map((p) => ({ label: p.label, longLabel: p.longLabel, value: p.results, complete: p.complete }))}
          format={(v) => int(v)}
          axisFormat={compact}
          extraRows={spendRow}
        />
        <LineChart
          title={`Cost per lead ${perPeriod}`}
          caption={`El cost per lead del període, ${span}. Un tall vol dir que aquell període no va tenir leads.`}
          seriesLabel={LEADS_COPY.cost}
          points={series.map((p) => ({ label: p.label, longLabel: p.longLabel, value: p.costPerResult, complete: p.complete }))}
          format={(v) => cash(v)}
          axisFormat={axisMoney}
          extraRows={(i) => [{ label: LEADS_COPY.option, value: int(series[i].results) }, ...spendRow(i)]}
        />
        {/* The spend chart is context for the two above it: full width when nothing shares its row. */}
        <div className={report.budgetChanges.length > 0 ? "min-w-0" : "min-w-0 lg:col-span-2"}>
          <ColumnChart
            title={`Inversió ${perPeriod}`}
            caption={`Serveix per veure si el canvi de CPL coincideix amb una variació de la inversió, ${span}.`}
            seriesLabel="Inversió"
            color="var(--color-context)"
            height={110}
            points={series.map((p) => ({ label: p.label, longLabel: p.longLabel, value: p.spend, complete: p.complete }))}
            format={(v) => cash(v)}
            axisFormat={(v) => cash(v, 0)}
            extraRows={(i) => [
              { label: LEADS_COPY.option, value: int(series[i].results) },
              { label: LEADS_COPY.cost, value: cash(series[i].costPerResult) },
            ]}
          />
        </div>
        {report.budgetChanges.length > 0 && (
          <div className="min-w-0">
            <h4 className="text-sm font-medium">Canvis de pressupost</h4>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-secondary">
              {report.budgetChanges.slice(0, 6).map((change, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 tabular-nums">
                  <span className="font-mono text-muted-foreground">{change.date}</span>
                  <span>
                    {cash(change.previous, 0)} → {cash(change.next, 0)}
                  </span>
                  <span className="text-muted-foreground">{change.adSetName ? `conjunt «${change.adSetName}»` : "campanya"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <MetricNotes kind="leads" />
    </div>
  );
}
