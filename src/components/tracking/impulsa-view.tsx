"use client";

import { CalendarClockIcon } from "lucide-react";
import { decimal, eur, int, isoToCa, ratio } from "@/tracking/domain/format";
import type { DonorTotals } from "@/tracking/domain/donors";
import { criterionText, impulsaCards, impulsaWeeks, impulsaWeeksTotals, type ImpulsaAggregate } from "@/tracking/domain/impulsa";
import { StackedColumnChart } from "./charts";
import { MetricNotes } from "./metric-notes";
import { StatCard } from "./stat-card";

const SERIES = {
  oneOff: { key: "oneOff", label: "Donatius puntuals", color: "var(--color-series-1)" },
  recurring: { key: "recurring", label: "Nous socis", color: "var(--color-series-2)" },
};

export function ImpulsaView({ aggregate, totals }: { aggregate: ImpulsaAggregate; totals: DonorTotals }) {
  const cards = impulsaCards(aggregate, totals);
  const weeks = impulsaWeeks(aggregate, null);
  const weekTotals = impulsaWeeksTotals(weeks);
  const recurring = aggregate.frequency.filter((f) => f.recurring);
  const oneOff = aggregate.frequency.filter((f) => !f.recurring);
  // Says what the figure covers, which grows a year at a time.
  const yearsCovered =
    cards.generatedFrom === cards.generatedTo
      ? `El primer any de cada alta, segons el criteri del fitxer. Totes són del ${cards.generatedTo}.`
      : `Tot el que han generat les altes del ${cards.generatedFrom} ençà, any a any fins al ${cards.generatedTo}, més el primer any de les noves.`;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Xifres de la campanya" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Inversió aproximada"
          value={eur(cards.spendEur, 0)}
          sub={`Meta ${decimal(cards.metaSpendUsd)} $ i Google ${eur(cards.googleSpendEur)}, convertits a ${decimal(cards.impliedUsdToEur, 4)} €/$`}
        />
        <StatCard label="Facturació acumulada" value={eur(cards.billedEur, 0)} sub={`Cobrat fins a la data de tall, ${isoToCa(aggregate.cutOff)}`} />
        <StatCard label="ROAS actual" value={ratio(cards.roasBilled)} metric="roas" sub={`${eur(cards.billedEur, 0)} facturats ÷ ${eur(cards.spendEur, 0)} d’inversió`} />
        <StatCard label="Valor estimat el primer any" value={eur(cards.generatedEur, 0)} sub={yearsCovered} />
        <StatCard
          label="ROAS del primer any"
          value={ratio(cards.roasGenerated)}
          metric="roas"
          sub={`${eur(cards.generatedEur, 0)} generats ÷ ${eur(cards.spendEur, 0)} d’inversió`}
          className="max-sm:col-span-2 sm:max-lg:col-span-3"
        />
      </section>

      <section aria-label="Registres per setmana" className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <StackedColumnChart
          title="Donatius puntuals i nous socis per setmana"
          caption={`Per data de registre, del ${isoToCa(aggregate.registrations.first)} al ${isoToCa(aggregate.registrations.last)}. ${int(weekTotals.oneOffCount)} donatius puntuals i ${int(weekTotals.recurringCount)} nous socis en ${int(weekTotals.weeks)} setmanes. Les files excloses i la cancel·lada no hi consten.`}
          labels={weeks.map((w) => ({ label: w.label, longLabel: w.longLabel }))}
          series={[
            { ...SERIES.oneOff, value: (i) => weeks[i].oneOffCount },
            { ...SERIES.recurring, value: (i) => weeks[i].recurringCount },
          ]}
          format={(v) => int(v)}
          extraRows={(i) => [
            { label: "Facturat la setmana", value: eur(weeks[i].oneOffEur + weeks[i].recurringEur, 0) },
            { label: "Valor al primer any", value: eur(weeks[i].yearEur, 0) },
          ]}
        />
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CalendarClockIcon className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
          <span>
            {aggregate.source.kind === "live"
              ? `Dades de StockCrowd a ${isoToCa(aggregate.cutOff)}. Els socis amb targeta compten el que StockCrowd ha cobrat realment; els de domiciliació (CRM) compten les quotes vençudes, perquè les cobra el CRM i StockCrowd no les veu: anoteu-hi les impagades a la taula. ${aggregate.spendSources?.google === "live" ? "La inversió de Meta i la de Google Ads són en directe." : "La inversió de Meta és en directe; la de Google és una xifra fixa de la configuració."}`
              : `Les xifres acumulades són una instantània amb data de tall ${isoToCa(aggregate.cutOff)}: el fitxer no porta la despesa diària ni la data de cobrament de cada quota, de manera que el gràfic va per data de registre i les targetes es mantenen a la data de tall.`}
          </span>
        </p>
      </section>

      <section aria-labelledby="criteri" className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 id="criteri" className="text-sm font-medium">
          Criteri de projecció
        </h3>
        <p className="mt-1 font-mono text-xs text-ink-secondary">{criterionText(aggregate)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Així es passa d’una alta al que val el seu primer any. A la pestanya de donants i socis es pot canviar la quota d’un any i anotar-hi les que quedin impagades; les xifres de dalt es recalculen amb el que hi hagi anotat.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          {[...recurring, ...oneOff].map((frequency) => (
            <div key={frequency.key} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
              <dt>
                {frequency.key} <span className="text-muted-foreground">×{frequency.multiplier}</span>
              </dt>
              <dd className="tabular-nums">
                {int(frequency.count)} {frequency.recurring ? "socis" : "donatius"} · {eur(frequency.yearEur, 0)} el primer any
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <MetricNotes kind="donatius" />
    </div>
  );
}
