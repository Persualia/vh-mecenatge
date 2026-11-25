"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PLOT = { top: 16, right: 8, bottom: 22, left: 44 };
/** Bars never fill their slot: the leftover is the air between them. */
export const MAX_BAR = 24;
/** White doing the separating, the same width everywhere. */
export const SURFACE_GAP = 2;

export interface Tick {
  value: number;
  label: string;
}

/** Round tick values that cover the data, at most `count` of them. */
export function ticksFor(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

/** Hairline gridlines and the value axis. They stay a step off the surface. */
export function Grid({ ticks, scale, width, format }: { ticks: number[]; scale: (v: number) => number; width: number; format: (v: number) => string }) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PLOT.left} x2={width - PLOT.right} y1={scale(tick)} y2={scale(tick)} stroke={tick === 0 ? "var(--color-axis)" : "var(--color-grid)"} strokeWidth="1" shapeRendering="crispEdges" />
          <text x={PLOT.left - 8} y={scale(tick)} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted text-[11px] tabular-nums">
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Period labels along the bottom, thinned out until they stop colliding. */
export function BandLabels({ labels, band, width, height }: { labels: string[]; band: (i: number) => number; width: number; height: number }) {
  const slot = (width - PLOT.left - PLOT.right) / Math.max(1, labels.length);
  // A label is about 30px wide; 46px of slot keeps air between the ones that are kept.
  const every = Math.max(1, Math.ceil(46 / slot));
  // Counted back from the last period, so the right-hand label is always the newest one
  // and every label kept is a whole step from its neighbour.
  return (
    <g aria-hidden="true">
      {labels.map((label, i) =>
        (labels.length - 1 - i) % every === 0 ? (
          <text key={i} x={band(i)} y={height - 6} textAnchor="middle" className="fill-ink-muted font-mono text-[10px] tabular-nums">
            {label}
          </text>
        ) : null,
      )}
    </g>
  );
}

export interface HoverRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * The hover layer every chart here ships with: an invisible band per period, wider
 * than the mark, and a tooltip that follows it.
 */
export function HoverBands({
  count,
  band,
  slot,
  width,
  height,
  rows,
  title,
}: {
  count: number;
  band: (i: number) => number;
  slot: number;
  width: number;
  height: number;
  rows: (i: number) => HoverRow[];
  title: (i: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const tooltipWidth = 184;
  const x = active === null ? 0 : Math.min(Math.max(band(active) - tooltipWidth / 2, 4), width - tooltipWidth - 4);

  return (
    <>
      <g>
        {Array.from({ length: count }, (_, i) => (
          <rect
            key={i}
            x={band(i) - slot / 2}
            y={PLOT.top - 12}
            width={slot}
            height={height - PLOT.bottom - PLOT.top + 12}
            fill="transparent"
            className="focus-visible:fill-foreground/5 hover:fill-foreground/5"
            tabIndex={0}
            aria-describedby={active === i ? id : undefined}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
          >
            <title>{`${title(i)}: ${rows(i).map((r) => `${r.label} ${r.value}`).join(", ")}`}</title>
          </rect>
        ))}
      </g>
      {active !== null && (
        <foreignObject x={x} y={PLOT.top - 10} width={tooltipWidth} height={26 + rows(active).length * 18} className="pointer-events-none">
          <div id={id} role="tooltip" className="rounded-md bg-foreground px-2.5 py-1.5 text-[11px] text-background shadow-md">
            <div className="mb-0.5 font-medium">{title(active)}</div>
            {rows(active).map((row) => (
              <div key={row.label} className="flex items-center gap-1.5 tabular-nums">
                {row.color && <span className="size-2 flex-none rounded-full" style={{ background: row.color }} />}
                <span className="text-background/70">{row.label}</span>
                <span className="ml-auto font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </foreignObject>
      )}
    </>
  );
}

export function ChartFrame({ title, caption, legend, children, className }: { title: string; caption?: string; legend?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-sm font-medium">{title}</h4>
        {legend}
      </figcaption>
      {children}
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </figure>
  );
}

/** Identity never rests on colour alone: the legend is always there for two or more series. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span className="size-2.5 flex-none rounded-[3px]" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
