"use client"

import { useState } from "react"
import { AlertTriangle, Check, LayoutDashboard, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { brandCssVars, contrastRatio, DEFAULT_BRAND_COLOR, normalizeHex } from "@/lib/branding"

export const BRAND_PRESETS = [
  { name: "Indigo", value: DEFAULT_BRAND_COLOR },
  { name: "Blue", value: "#2563eb" },
  { name: "Teal", value: "#0f766e" },
  { name: "Green", value: "#15803d" },
  { name: "Maroon", value: "#9f1239" },
  { name: "Orange", value: "#c2410c" },
  { name: "Purple", value: "#7e22ce" },
  { name: "Slate", value: "#334155" },
] as const

/** Below this, brand-colored text/links on white are hard to read (WCAG
 * 3:1 — the minimum for large text and UI components). */
const MIN_CONTRAST_ON_WHITE = 3

const FULL_HEX = /^#?[0-9a-f]{6}$/i

/** Primary brand color picker for Settings → Branding: presets, native
 * color picker + hex input, contrast warning, reset, and a live preview.
 * `value` is "" for "use the default". */
export function BrandColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const color = normalizeHex(value) ?? DEFAULT_BRAND_COLOR
  // Free-typed hex draft; only valid values are pushed to the form.
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  function commit(next: string) {
    setDraft(next)
    onChange(next)
  }

  const lowContrast = contrastRatio(color, "#ffffff") < MIN_CONTRAST_ON_WHITE

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Preset colors" className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((preset) => {
          const selected = color === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.name}
              title={preset.name}
              onClick={() => commit(preset.value === DEFAULT_BRAND_COLOR ? "" : preset.value)}
              className={cn(
                "flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface-container-lowest transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected ? "ring-2 ring-on-surface" : "hover:ring-2 hover:ring-outline-variant",
              )}
              style={{ backgroundColor: preset.value }}
            >
              {selected && <Check aria-hidden className="size-4 text-white" />}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label="Custom color"
          value={color}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-outline-variant bg-transparent p-1"
        />
        <Input
          aria-label="Hex color"
          placeholder={DEFAULT_BRAND_COLOR}
          value={draft}
          maxLength={7}
          onChange={(e) => {
            const next = e.target.value
            setDraft(next)
            // Only a complete 6-digit hex updates the form (no "#abc" shorthand
            // mid-typing); clearing the field resets to the default.
            if (FULL_HEX.test(next.trim())) onChange(normalizeHex(next)!)
            else if (next.trim() === "") onChange("")
          }}
          aria-invalid={draft.trim() !== "" && !FULL_HEX.test(draft.trim())}
          className="w-32 font-mono uppercase"
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => commit("")} className="gap-2">
            <RotateCcw aria-hidden className="size-4" />
            Reset to default
          </Button>
        )}
      </div>

      {lowContrast && (
        <p className="flex items-start gap-2 text-xs text-warning-700">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          This color is quite light — links and text in this color may be hard to read on white backgrounds. A darker
          shade is recommended.
        </p>
      )}

      <BrandPreview color={color} />
    </div>
  )
}

/** Mini sample of brand-colored UI. `data-brand-scope` re-derives every
 * primary token from this element's own --brand (see globals.css), so the
 * preview matches the real app in both light and dark mode. */
export function BrandPreview({ color }: { color: string }) {
  return (
    <div
      data-brand-scope
      style={brandCssVars(color) as React.CSSProperties}
      className="rounded-lg border border-outline-variant bg-background p-4"
    >
      <p className="mb-3 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Preview</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 rounded-r-full border-l-4 border-primary bg-secondary-container py-2 pr-4 pl-3 text-sm font-medium text-on-secondary-container">
          <LayoutDashboard aria-hidden className="size-4" />
          Dashboard
        </div>
        <Button type="button" tabIndex={-1}>
          Primary button
        </Button>
        <span className="text-sm font-semibold text-primary underline-offset-4 ">View details</span>
        <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 text-xs font-semibold text-on-primary-fixed">
          Badge
        </span>
      </div>
    </div>
  )
}
