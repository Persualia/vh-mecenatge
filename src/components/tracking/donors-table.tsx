"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { LockIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, int, isoToCa } from "@/tracking/domain/format";
import {
  CHANNEL_OPTIONS,
  EXCLUDED_STATE,
  STATE_OPTIONS,
  donorTotals,
  resolveRows,
  searchRows,
  yearColumns,
  type DonorOverride,
  type DonorOverrides,
  type DonorRecord,
  type DonorRow,
} from "@/tracking/domain/donors";

export interface DonorsTableProps {
  records: DonorRecord[];
  overrides: DonorOverrides;
  today: string;
  /** Saves one record's corrections. Resolves with every correction after the write. */
  onSave: (ref: string, override: DonorOverride) => Promise<void>;
  saving: string | null;
  error: string | null;
  /** The refs of the records made with an e-mail, looked up on the server by its hash. */
  searchByEmail: (email: string) => Promise<string[]>;
}

/** Typed text that reads as an address is searched by e-mail; anything else, in the table. */
const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

type EmailSearch = { email: string; refs: string[] | null; error: string | null };

/** The corrections a row carries, derived from what it now shows against what is on file. */
function overrideFor(row: DonorRow, record: DonorRecord): DonorOverride {
  const override: DonorOverride = {};
  if (row.channel !== record.channel) override.channel = row.channel;
  if (row.state !== record.state) override.state = row.state;
  const years: DonorOverride["years"] = {};
  for (const cell of row.years) {
    const edit: { quota?: number; unpaid?: number } = {};
    if (cell.quota !== record.base) edit.quota = cell.quota;
    if (cell.unpaid > 0) edit.unpaid = cell.unpaid;
    if (edit.quota !== undefined || edit.unpaid !== undefined) years[String(cell.year)] = edit;
  }
  if (Object.keys(years).length) override.years = years;
  return override;
}

/**
 * A select that tells the truth about what it holds. A value the options do not cover would
 * otherwise show as the first option, which is how a row silently changes meaning; here it
 * gets an option of its own, marked, until someone picks a known one.
 */
function Choice({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; label: string }) {
  const known = options.some((option) => option.value === value);
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={cn(
        "h-7 rounded-md border border-input bg-card px-1.5 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        !known && "border-destructive/60 text-destructive",
      )}
    >
      {!known && <option value={value}>{value} (sense reconèixer)</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function DonorsTable({ records, overrides, today, onSave, saving, error, searchByEmail }: DonorsTableProps) {
  const [query, setQuery] = useState("");
  const [emailSearch, setEmailSearch] = useState<EmailSearch | null>(null);

  const email = looksLikeEmail(query) ? query.trim() : null;
  useEffect(() => {
    if (!email) return;
    // Wait for the typing to stop, and drop an answer that arrives after the text changed.
    let current = true;
    const timer = setTimeout(() => {
      searchByEmail(email).then(
        (refs) => current && setEmailSearch({ email, refs, error: null }),
        (failure: unknown) => current && setEmailSearch({ email, refs: null, error: failure instanceof Error ? failure.message : "No s’ha pogut cercar." }),
      );
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [email, searchByEmail]);
  const found = email && emailSearch?.email === email ? emailSearch : null;

  const years = useMemo(() => yearColumns(records, overrides, today), [records, overrides, today]);
  const rows = useMemo(() => resolveRows(records, overrides, years, today), [records, overrides, years, today]);
  const visible = useMemo(() => {
    if (!email) return searchRows(rows, query);
    const refs = new Set(found?.refs ?? []);
    return rows.filter((row) => refs.has(row.ref));
  }, [rows, query, email, found]);
  const totals = useMemo(() => donorTotals(rows, years, today), [rows, years, today]);
  const shownTotals = useMemo(() => donorTotals(visible, years, today), [visible, years, today]);
  const byRef = useMemo(() => new Map(records.map((r) => [r.ref, r])), [records]);

  const change = (row: DonorRow, patch: Partial<Pick<DonorRow, "channel" | "state">> | { year: number; quota?: number; unpaid?: number }) => {
    const record = byRef.get(row.ref)!;
    const next: DonorRow = { ...row, years: row.years.map((c) => ({ ...c })) };
    if ("year" in patch) {
      const cell = next.years.find((c) => c.year === patch.year)!;
      if (patch.quota !== undefined) cell.quota = patch.quota;
      if (patch.unpaid !== undefined) cell.unpaid = Math.min(Math.max(patch.unpaid, 0), cell.instalments);
    } else {
      Object.assign(next, patch);
    }
    void onSave(row.ref, overrideFor(next, record));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            id="donor-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per referència, data, import, origen o correu…"
            aria-label="Cerca un donant o soci"
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          />
        </label>
        <p className="text-xs text-muted-foreground tabular-nums">
          {email && !found ? "Cercant el correu…" : query ? `${int(visible.length)} de ${int(rows.length)} registres` : `${int(rows.length)} registres`} · {int(totals.counted)} computables · {int(totals.edited)} amb correccions a mà
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-ink-secondary">
        <LockIcon className="mt-0.5 size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
        <span>
          El nom i el correu de cada donant no arriben mai al navegador: la taula funciona amb una referència. Si escriviu un correu sencer a la cerca, el servidor el compara pel seu hash (SHA-256) amb els de StockCrowd i només en torna les referències. Tota la resta —origen, estat, quota i impagats— és la de debò i es pot editar aquí.
        </span>
      </p>

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      {found?.error && <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{found.error}</p>}

      <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th colSpan={9} className="border-b border-border px-2.5 py-1.5 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Registre
              </th>
              {years.map((year) => (
                <th key={year} colSpan={3} className="border-b border-l border-border px-2.5 py-1.5 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {year}
                </th>
              ))}
            </tr>
            <tr className="bg-muted/30 text-xs text-muted-foreground">
              <th className="px-2.5 py-2 text-left font-medium">Ref.</th>
              <th className="px-2.5 py-2 text-left font-medium">Donant</th>
              <th className="px-2.5 py-2 text-left font-medium">Correu</th>
              <th className="px-2.5 py-2 text-left font-medium">Data</th>
              <th className="px-2.5 py-2 text-left font-medium">Origen</th>
              <th className="px-2.5 py-2 text-right font-medium">Import base</th>
              <th className="px-2.5 py-2 text-left font-medium">Freqüència</th>
              <th className="px-2.5 py-2 text-left font-medium">Estat</th>
              <th className="px-2.5 py-2 text-right font-medium">Facturat</th>
              {years.map((year) => (
                <Fragment key={year}>
                  <th className="border-l border-border px-2.5 py-2 text-right font-medium">Quota</th>
                  <th className="px-2.5 py-2 text-right font-medium">Impagats</th>
                  <th className="px-2.5 py-2 text-right font-medium">Previst</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.ref} className={cn("border-t border-border", !row.counts && "text-muted-foreground", saving === row.ref && "bg-muted/40")}>
                <td className="px-2.5 py-1.5 font-mono text-xs whitespace-nowrap">{row.ref}</td>
                <td className="px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground italic">ocult</td>
                <td className="px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground italic">ocult</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap tabular-nums">{isoToCa(row.date)}</td>
                <td className="px-2.5 py-1.5">
                  <Choice
                    value={row.channel}
                    options={CHANNEL_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                    onChange={(channel) => change(row, { channel })}
                    label={`Origen del trànsit de ${row.ref}`}
                  />
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{eur(row.base, 0)}</td>
                <td className="px-2.5 py-1.5 text-xs whitespace-nowrap">{row.frequency}</td>
                <td className="px-2.5 py-1.5">
                  {row.state === EXCLUDED_STATE ? (
                    <span className="text-xs" title="Retornat a la plataforma">{row.state}</span>
                  ) : (
                    <Choice value={row.state} options={STATE_OPTIONS.map((o) => ({ value: o, label: o }))} onChange={(state) => change(row, { state })} label={`Estat de ${row.ref}`} />
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{eur(row.billedEffective, 0)}</td>
                {row.years.map((cell) => (
                  <Fragment key={cell.year}>
                    <td className="border-l border-border px-2.5 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cell.quota}
                        disabled={cell.instalments === 0}
                        onChange={(event) => change(row, { year: cell.year, quota: Number(event.target.value) })}
                        aria-label={`Quota de ${row.ref} el ${cell.year}`}
                        className="h-7 w-20 rounded-md border border-input bg-card px-1.5 text-right text-xs tabular-nums disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        max={cell.instalments}
                        step="1"
                        value={cell.unpaid}
                        disabled={cell.instalments === 0}
                        onChange={(event) => change(row, { year: cell.year, unpaid: Number(event.target.value) })}
                        aria-label={`Quotes impagades de ${row.ref} el ${cell.year}, de ${cell.instalments}`}
                        title={cell.instalments === 0 ? "Aquest registre no té quotes aquest any" : `De ${cell.instalments} quotes l’any`}
                        className={cn(
                          "h-7 w-16 rounded-md border border-input bg-card px-1.5 text-right text-xs tabular-nums disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                          cell.unpaid > 0 && "border-destructive/50 text-destructive",
                        )}
                      />
                    </td>
                    <td className={cn("px-2.5 py-1.5 text-right tabular-nums", cell.edited && "font-medium")}>
                      {cell.instalments === 0 ? "–" : eur(cell.value, 0)}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9 + years.length * 3} className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                  Cap registre coincideix amb «{query}».
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-medium">
              <td colSpan={8} className="px-2.5 py-2">
                {query ? `Total dels ${int(visible.length)} registres filtrats` : "Total de tots els registres computables"}
              </td>
              <td className="px-2.5 py-2 text-right tabular-nums">{eur(shownTotals.billedEur, 0)}</td>
              {years.map((year) => (
                <Fragment key={year}>
                  <td className="border-l border-border" />
                  <td className="px-2.5 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {shownTotals.unpaidInstalments > 0 ? `${int(shownTotals.unpaidInstalments)} impag.` : ""}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{eur(shownTotals.byYear[year] ?? 0, 0)}</td>
                </Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        «Quota» és l’import d’una quota aquell any i «Impagats», quantes no s’han cobrat; «Previst» és el que queda, i és el que alimenta les xifres de dalt. Una columna nova apareix sola en començar l’any, i l’any vinent hi és sempre perquè s’hi pugui anotar un canvi d’import abans que arribi. Un registre d’un sol pagament no té quotes els anys següents, i per això la seva cel·la queda inactiva.
      </p>
    </div>
  );
}
