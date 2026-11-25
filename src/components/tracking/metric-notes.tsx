import type { CampaignKind } from "@/tracking/domain/campaigns";
import { notesFor, ROI_PENDING, showsRoiPending } from "@/tracking/domain/metrics";

/** Only the metrics the campaign at hand actually uses. */
export function MetricNotes({ kind }: { kind: CampaignKind }) {
  const notes = notesFor(kind);
  const roi = showsRoiPending(kind);
  return (
    <section aria-labelledby="com-es-llegeix" className="rounded-xl bg-muted/60 p-4 ring-1 ring-foreground/5">
      <h3 id="com-es-llegeix" className="text-sm font-medium">
        Com es llegeixen aquestes xifres
      </h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {notes.map((note) => (
          <div key={note.id}>
            <dt className="text-sm font-medium">
              {note.short} · {note.name}
              <span className="ml-1.5 font-mono text-xs font-normal text-ink-secondary">{note.formula}</span>
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note.text}</dd>
          </div>
        ))}
        {roi && (
          <div>
            <dt className="text-sm font-medium">
              {ROI_PENDING.label}
              <span className="ml-1.5 font-mono text-xs font-normal text-ink-secondary">{ROI_PENDING.formula}</span>
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{ROI_PENDING.text}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
