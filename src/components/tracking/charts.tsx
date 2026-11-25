"use client";

import { BandLabels, ChartFrame, Grid, HoverBands, Legend, MAX_BAR, PLOT, SURFACE_GAP, ticksFor, type HoverRow } from "./chart-parts";
import { useChartWidth } from "./use-chart-width";

export interface ChartPoint {
  label: string;
  longLabel: string;
  /** Null is "cannot be computed" and draws nothing; zero is a real zero. */
  value: number | null;
  complete?: boolean;
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function columnPath(x: number, width: number, top: number, baseline: number) {
  const height = baseline - top;
  const r = Math.min(4, width / 2, Math.max(0, height));
  if (height <= 0) return "";
  return `M${x} ${baseline} L${x} ${top + r} Q${x} ${top} ${x + r} ${top} L${x + width - r} ${top} Q${x + width} ${top} ${x + width} ${top + r} L${x + width} ${baseline} Z`;
}

/**
 * The value on the tallest column. A column that reaches the top tick leaves no room
 * above it, so the label moves inside the fill rather than being clipped.
 */
function PeakLabel({ x, top, text, width }: { x: number; top: number; text: string; width: number }) {
  const inside = top - 6 < PLOT.top;
  // Half the label's width, so it never hangs over the value axis or off the right edge.
  const margin = text.length * 3.2;
  const placed = Math.min(Math.max(x, PLOT.left + margin), width - PLOT.right - margin);
  return (
    <text
      x={placed}
      y={inside ? top + 14 : top - 6}
      textAnchor="middle"
      // A halo in the surface colour keeps the label readable where it crosses a gridline.
      stroke={inside ? "none" : "var(--color-card)"}
      strokeWidth={inside ? 0 : 3}
      paintOrder="stroke"
      className={inside ? "fill-white text-[11px] font-medium tabular-nums" : "fill-ink-secondary text-[11px] font-medium tabular-nums"}
    >
      {text}
    </text>
  );
}

interface Geometry {
  width: number;
  height: number;
  slot: number;
  band: (i: number) => number;
  scale: (v: number) => number;
  ticks: number[];
}

function geometry(width: number, height: number, count: number, max: number): Geometry {
  const plotWidth = width - PLOT.left - PLOT.right;
  const slot = plotWidth / Math.max(1, count);
  const ticks = ticksFor(max);
  const top = ticks[ticks.length - 1] || 1;
  return {
    width,
    height,
    slot,
    band: (i: number) => PLOT.left + slot * (i + 0.5),
    scale: (v: number) => height - PLOT.bottom - (v / top) * (height - PLOT.bottom - PLOT.top),
    ticks,
  };
}

export interface ColumnChartProps {
  title: string;
  caption?: string;
  points: ChartPoint[];
  /** How a value reads in the tooltip, the axis and the direct label. */
  format: (value: number | null) => string;
  /** Shorter form for the axis ticks, when the full one is too wide. */
  axisFormat?: (value: number) => string;
  color?: string;
  height?: number;
  seriesLabel: string;
  /** Rows added to the tooltip, so a change in cost can be read beside its spend. */
  extraRows?: (index: number) => HoverRow[];
}

export function ColumnChart({ title, caption, points, format, axisFormat, color = "var(--color-series-1)", height = 150, seriesLabel, extraRows }: ColumnChartProps) {
  const { ref, width } = useChartWidth();
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  const g = geometry(width, height, points.length, max);
  const barWidth = Math.max(2, Math.min(MAX_BAR, g.slot - SURFACE_GAP));
  const peak = points.reduce((best, p, i) => ((p.value ?? 0) > (points[best]?.value ?? -1) ? i : best), 0);

  return (
    <ChartFrame title={title} caption={caption}>
      <div ref={ref} className="w-full">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${seriesLabel} per període, de ${points[0]?.longLabel ?? ""} a ${points[points.length - 1]?.longLabel ?? ""}.`}>
          <Grid ticks={g.ticks} scale={g.scale} width={width} format={(v) => (axisFormat ?? ((x: number) => format(x)))(v)} />
          <g>
            {points.map((point, i) =>
              point.value === null ? null : (
                <path
                  key={i}
                  d={columnPath(g.band(i) - barWidth / 2, barWidth, g.scale(point.value), g.scale(0))}
                  fill={color}
                  opacity={point.complete === false ? 0.45 : 1}
                />
              ),
            )}
          </g>
          {max > 0 && <PeakLabel x={g.band(peak)} top={g.scale(points[peak].value ?? 0)} text={format(points[peak].value)} width={width} />}
          <BandLabels labels={points.map((p) => p.label)} band={g.band} width={width} height={height} />
          <HoverBands
            count={points.length}
            band={g.band}
            slot={g.slot}
            width={width}
            height={height}
            title={(i) => points[i].longLabel}
            rows={(i) => [{ label: seriesLabel, value: format(points[i].value), color }, ...(extraRows?.(i) ?? [])]}
          />
        </svg>
      </div>
    </ChartFrame>
  );
}

export interface LineChartProps extends Omit<ColumnChartProps, "color"> {
  color?: string;
}

export function LineChart({ title, caption, points, format, axisFormat, color = "var(--color-series-2)", height = 150, seriesLabel, extraRows }: LineChartProps) {
  const { ref, width } = useChartWidth();
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  const g = geometry(width, height, points.length, max);

  // A gap in the line is a period the figure cannot be computed for, not a zero.
  const segments: { i: number; x: number; y: number }[][] = [];
  points.forEach((point, i) => {
    if (point.value === null) {
      if (segments[segments.length - 1]?.length) segments.push([]);
      return;
    }
    if (!segments.length) segments.push([]);
    segments[segments.length - 1].push({ i, x: g.band(i), y: g.scale(point.value) });
  });
  const drawn = segments.filter((s) => s.length > 0);
  const last = drawn[drawn.length - 1]?.at(-1);

  return (
    <ChartFrame title={title} caption={caption}>
      <div ref={ref} className="w-full">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${seriesLabel} per període.`}>
          <Grid ticks={g.ticks} scale={g.scale} width={width} format={(v) => (axisFormat ?? ((x: number) => format(x)))(v)} />
          {drawn.map((segment, s) => (
            <g key={s}>
              {segment.length > 1 && (
                <path d={`M${segment.map((p) => `${p.x} ${p.y}`).join(" L")} L${segment.at(-1)!.x} ${g.scale(0)} L${segment[0].x} ${g.scale(0)} Z`} fill={color} opacity={0.1} />
              )}
              <path
                d={segment.length > 1 ? `M${segment.map((p) => `${p.x} ${p.y}`).join(" L")}` : `M${segment[0].x - 4} ${segment[0].y} L${segment[0].x + 4} ${segment[0].y}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
          {last && (
            <>
              <circle cx={last.x} cy={last.y} r="4" fill={color} stroke="var(--color-card)" strokeWidth="2" />
              {/* The last point is usually at the right edge, so its value sits to its left. */}
              <text
                x={last.x > width / 2 ? last.x - 8 : last.x + 8}
                y={Math.max(last.y - 8, PLOT.top - 2)}
                textAnchor={last.x > width / 2 ? "end" : "start"}
                stroke="var(--color-card)"
                strokeWidth="3"
                paintOrder="stroke"
                className="fill-ink-secondary text-[11px] font-medium tabular-nums"
              >
                {format(points[last.i].value)}
              </text>
            </>
          )}
          <BandLabels labels={points.map((p) => p.label)} band={g.band} width={width} height={height} />
          <HoverBands
            count={points.length}
            band={g.band}
            slot={g.slot}
            width={width}
            height={height}
            title={(i) => points[i].longLabel}
            rows={(i) => [{ label: seriesLabel, value: format(points[i].value), color }, ...(extraRows?.(i) ?? [])]}
          />
        </svg>
      </div>
    </ChartFrame>
  );
}

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
  value: (index: number) => number;
}

export interface StackedColumnChartProps {
  title: string;
  caption?: string;
  labels: { label: string; longLabel: string }[];
  series: StackedSeries[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  height?: number;
  extraRows?: (index: number) => HoverRow[];
}

/** One whole split into parts, with a 2px surface gap between the segments. */
export function StackedColumnChart({ title, caption, labels, series, format, axisFormat, height = 170, extraRows }: StackedColumnChartProps) {
  const { ref, width } = useChartWidth();
  const totals = labels.map((_, i) => series.reduce((t, s) => t + s.value(i), 0));
  const g = geometry(width, height, labels.length, Math.max(0, ...totals));
  const barWidth = Math.max(3, Math.min(MAX_BAR, g.slot - SURFACE_GAP));
  const peak = totals.reduce((best, value, i) => (value > totals[best] ? i : best), 0);

  return (
    <ChartFrame title={title} caption={caption} legend={<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}>
      <div ref={ref} className="w-full">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${series.map((s) => s.label).join(" i ")} per setmana.`}>
          <Grid ticks={g.ticks} scale={g.scale} width={width} format={(v) => (axisFormat ?? format)(v)} />
          <g>
            {labels.map((_, i) => {
              let base = 0;
              return series.map((s) => {
                const value = s.value(i);
                if (value <= 0) return null;
                const top = g.scale(base + value);
                const bottom = g.scale(base);
                base += value;
                const isTop = base === totals[i];
                const y = top;
                const h = Math.max(1, bottom - top - (isTop ? 0 : SURFACE_GAP));
                return isTop ? (
                  <path key={s.key + i} d={columnPath(g.band(i) - barWidth / 2, barWidth, y, y + h)} fill={s.color} />
                ) : (
                  <rect key={s.key + i} x={g.band(i) - barWidth / 2} y={y} width={barWidth} height={h} fill={s.color} />
                );
              });
            })}
          </g>
          {totals[peak] > 0 && <PeakLabel x={g.band(peak)} top={g.scale(totals[peak])} text={format(totals[peak])} width={width} />}
          <BandLabels labels={labels.map((l) => l.label)} band={g.band} width={width} height={height} />
          <HoverBands
            count={labels.length}
            band={g.band}
            slot={g.slot}
            width={width}
            height={height}
            title={(i) => labels[i].longLabel}
            rows={(i) => [...series.map((s) => ({ label: s.label, value: format(s.value(i)), color: s.color })), { label: "Total", value: format(totals[i]) }, ...(extraRows?.(i) ?? [])]}
          />
        </svg>
      </div>
    </ChartFrame>
  );
}
