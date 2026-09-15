"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

const PRESETS = ["Today", "This Week", "This Month", "Last 30 Days"] as const;
type Preset = (typeof PRESETS)[number];

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Computes a preset's date range as of "now" — exported so the owning page
 * can seed its initial state with the same logic instead of duplicating it. */
export function getPresetRange(preset: Preset): DateRange {
  const today = new Date();
  const end = toISODate(today);
  if (preset === "Today") return { dateFrom: end, dateTo: end };
  if (preset === "This Week") {
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const diffToMonday = (dayOfWeek + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - diffToMonday);
    return { dateFrom: toISODate(start), dateTo: end };
  }
  if (preset === "This Month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: toISODate(start), dateTo: end };
  }
  // Last 30 Days
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  return { dateFrom: toISODate(start), dateTo: end };
}

export const DEFAULT_DATE_PRESET: Preset = "Last 30 Days";

/** Global date-range filter for the Reports page — preset buttons plus a
 * "Custom" toggle revealing the same two-Input[type=date] pattern used by
 * every other date-filtered list page (invoices, visitors, leave requests). */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [activePreset, setActivePreset] = useState<Preset | null>(DEFAULT_DATE_PRESET);
  const [showCustom, setShowCustom] = useState(false);

  function applyPreset(preset: Preset) {
    setActivePreset(preset);
    setShowCustom(false);
    onChange(getPresetRange(preset));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-lowest p-1 shadow-sm">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              activePreset === preset && !showCustom
                ? "bg-surface-container font-semibold text-primary"
                : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
            )}
          >
            {preset}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setActivePreset(null);
            setShowCustom(true);
          }}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            showCustom
              ? "bg-surface-container font-semibold text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
          )}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2">
          <Input
            type="date"
            value={value.dateFrom}
            onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
            aria-label="From date"
            className="h-9 w-[140px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="text-on-surface-variant">–</span>
          <Input
            type="date"
            value={value.dateTo}
            onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
            aria-label="To date"
            className="h-9 w-[140px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      )}
    </div>
  );
}
