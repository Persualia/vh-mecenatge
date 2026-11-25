import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { METRIC_NOTES, type MetricNote } from "@/tracking/domain/metrics";

export interface StatCardProps {
  label: string;
  value: string;
  /** Second line: what the figure is made of. */
  sub?: ReactNode;
  /** Attaches the short explanation of a metric to the label. */
  metric?: MetricNote["id"];
  className?: string;
}

export function StatCard({ label, value, sub, metric, className }: StatCardProps) {
  const note = metric ? METRIC_NOTES[metric] : null;
  return (
    <Card size="sm" className={cn("justify-between gap-2", className)}>
      <CardContent className="flex items-start justify-between gap-2">
        <h3 className="text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
        {note && (
          <Tooltip>
            <TooltipTrigger
              className="-m-1 flex-none rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Com es calcula: ${note.name}`}
            >
              <InfoIcon className="size-3.5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs flex-col items-start gap-1 py-2 text-left">
              <span className="font-medium">{`${note.name} = ${note.formula}`}</span>
              <span className="text-background/80">{note.text}</span>
            </TooltipContent>
          </Tooltip>
        )}
      </CardContent>
      <CardContent>
        <p className="text-[clamp(1.4rem,3.4vw,1.85rem)] leading-none font-semibold">{value}</p>
        {sub && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
