"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

/** Light / Dark / System segmented control (next-themes — the choice is
 * persisted per browser in localStorage, not per account). Rendered inside
 * the Topbar account menu, which only mounts client-side after a click, so
 * `theme` is always resolved here (no hydration mismatch). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="px-1.5 py-1">
      <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Theme</p>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center justify-center gap-1 rounded px-1.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:cursor-pointer",
                active
                  ? "bg-popover text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
