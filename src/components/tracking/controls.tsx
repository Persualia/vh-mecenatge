"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Granularity, RangePreset } from "@/tracking/domain/calendar";
import { campaignGroups, type BoardCampaign } from "@/tracking/domain/campaigns";

/** Only the readable name of the campaign, grouped by what the campaign measures. */
export function CampaignSelect({ campaigns, value, onChange }: { campaigns: BoardCampaign[]; value: string; onChange: (key: string) => void }) {
  const groups = campaignGroups(campaigns);
  const items = Object.fromEntries(campaigns.map((c) => [c.key, c.name]));

  return (
    <label className="flex min-w-0 max-w-full flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Campanyes</span>
      <Select items={items} value={value} onValueChange={(next) => onChange(String(next))}>
        <SelectTrigger className="h-9 w-full min-w-0 bg-card text-sm font-medium sm:w-64" aria-label="Campanyes">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group, index) => (
            <SelectGroup key={group.kind}>
              {index > 0 && <SelectSeparator />}
              <SelectLabel>{group.label}</SelectLabel>
              {group.campaigns.map((campaign) => (
                <SelectItem key={campaign.key} value={campaign.key}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function SegmentedControl<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {/* Wraps to a second row rather than overflowing: four presets do not fit a phone. */}
      <div role="group" aria-label={label} className="flex min-h-9 flex-wrap items-center gap-0.5 rounded-lg bg-card p-0.5 ring-1 ring-input">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-8 rounded-[7px] px-2.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              value === option.id ? "bg-foreground font-medium text-background" : "text-ink-secondary hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RangeFilter({ presets, value, onChange }: { presets: RangePreset[]; value: string; onChange: (id: string) => void }) {
  return <SegmentedControl label="Període" options={presets.map((p) => ({ id: p.id, label: p.label }))} value={value} onChange={onChange} />;
}

export function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (value: Granularity) => void }) {
  return (
    <SegmentedControl
      label="Agrupació"
      options={[
        { id: "day", label: "Per dia" },
        { id: "week", label: "Per setmana" },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/** The two faces of a donations campaign: the figures, and the records behind them. */
export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label="Vistes de la campanya" className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === tab.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
