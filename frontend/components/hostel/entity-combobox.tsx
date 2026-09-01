"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

export interface ComboOption {
  value: string
  label: string
  sublabel?: string
}

/**
 * Async remote search-select (SearchSelect, per the design spec) used for the
 * Building/Floor/Room/Bed cascade pickers and the resident/admission pickers
 * in the Allocation workflow. Filtering happens server-side via the resource's
 * existing `search`/scope query params — this component never filters
 * client-side.
 */
export function EntityCombobox({
  value,
  onChange,
  fetchOptions,
  placeholder,
  disabled,
  emptyMessage = "No results found.",
  id,
  className,
}: {
  value: ComboOption | null
  onChange: (value: ComboOption | null) => void
  fetchOptions: (search: string) => Promise<ComboOption[]>
  placeholder?: string
  disabled?: boolean
  emptyMessage?: string
  id?: string
  className?: string
}) {
  const [inputValue, setInputValue] = useState("")
  const [options, setOptions] = useState<ComboOption[]>(value ? [value] : [])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      fetchOptions(inputValue)
        .then((results) => {
          if (!cancelled) setOptions(results)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, open])

  return (
    <Combobox<ComboOption>
      items={options}
      filter={null}
      value={value}
      onValueChange={(next) => onChange(next ?? null)}
      onInputValueChange={setInputValue}
      onOpenChange={setOpen}
      itemToStringLabel={(item) => item?.label ?? ""}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showClear={!!value}
        className={cn(
          "rounded-lg border-transparent bg-surface-container px-1 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          className,
        )}
      />
      <ComboboxContent>
        <ComboboxList>
          {loading ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">Searching…</div>
          ) : options.length === 0 ? (
            <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          ) : (
            options.map((item) => (
              <ComboboxItem key={item.value} value={item}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.sublabel && (
                    <span className="truncate text-xs text-muted-foreground">{item.sublabel}</span>
                  )}
                </span>
              </ComboboxItem>
            ))
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
