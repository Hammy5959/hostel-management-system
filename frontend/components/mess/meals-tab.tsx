"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldOff, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"

import { todayLocalDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, bulkMarkMeals, getMealsRegister } from "@/lib/api"
import type { MealType } from "@/lib/types"

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
]

export function MealsTab() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [mealDate, setMealDate] = useState(todayLocalDate)
  const [mealType, setMealType] = useState<MealType>("breakfast")
  const [edits, setEdits] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [saving, setSaving] = useState(false)

  const canView = has("meals.view")
  const canMark = has("meals.create")

  const query = useQuery({
    queryKey: ["meals-register", mealDate, mealType],
    queryFn: () => getMealsRegister({ meal_date: mealDate, meal_type: mealType }),
    enabled: canView,
  })

  // The table always starts from server truth for the selected date/type —
  // unsaved edits don't carry across a date/type change or a successful save.
  const selectionKey = `${mealDate}|${mealType}`
  const [lastSelectionKey, setLastSelectionKey] = useState(selectionKey)
  if (selectionKey !== lastSelectionKey) {
    setLastSelectionKey(selectionKey)
    setEdits({})
    setPage(1)
  }

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const total = items.length
  const pagedItems = useMemo(() => items.slice((page - 1) * perPage, page * perPage), [items, page, perPage])

  function effectiveConsumed(residentId: string, serverValue: boolean): boolean {
    return edits[residentId] ?? serverValue
  }

  const allChecked = items.length > 0 && items.every((item) => effectiveConsumed(item.resident_id, item.consumed))

  function toggleOne(residentId: string, checked: boolean) {
    setEdits((prev) => ({ ...prev, [residentId]: checked }))
  }

  function toggleAll() {
    const next: Record<string, boolean> = {}
    for (const item of items) {
      next[item.resident_id] = !allChecked
    }
    setEdits(next)
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  async function handleSave() {
    if (items.length === 0) return
    setSaving(true)
    try {
      const entries = items.map((item) => ({
        resident_id: item.resident_id,
        consumed: effectiveConsumed(item.resident_id, item.consumed),
      }))
      const result = await bulkMarkMeals({ meal_date: mealDate, meal_type: mealType, entries })
      if (result.failed_count > 0) {
        toast.error(`${result.marked_count} marked, ${result.failed_count} failed.`)
      } else {
        toast.success(`${result.marked_count} meals marked for ${mealDate}.`)
      }
      queryClient.invalidateQueries({ queryKey: ["meals-register"] })
      setEdits({})
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("meals.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex flex-col gap-4 border-b border-outline-variant bg-background/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2">
            <Input
              type="date"
              value={mealDate}
              onChange={(e) => setMealDate(e.target.value)}
              aria-label="Meal date"
              className="h-9 w-38 border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <Select value={mealType} onValueChange={(value) => value && setMealType(value as MealType)}>
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-40" aria-label="Meal type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEAL_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canMark && (
          <Button type="button" onClick={handleSave} disabled={saving || items.length === 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {forbidden || !canView ? (
        <div className="p-4">
          <EmptyState
            icon={ShieldOff}
            title="You don't have access to Meals"
            description="Ask an administrator to grant you the meals.view permission."
          />
        </div>
      ) : query.isError ? (
        <div className="p-4">
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </div>
      ) : query.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={UtensilsCrossed}
            title="No residents to mark"
            description="No active or on-leave residents were found for this date."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table className="w-full border-collapse text-left">
              <TableHeader>
                <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                  {canMark && (
                    <TableHead className="h-auto w-10 px-6 py-4">
                      <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                    </TableHead>
                  )}
                  <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                    Resident
                  </TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                    Consumed
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-outline-variant">
                {pagedItems.map((item) => {
                  const name = [item.first_name, item.last_name].filter(Boolean).join(" ")
                  const checked = effectiveConsumed(item.resident_id, item.consumed)
                  return (
                    <TableRow key={item.resident_id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60">
                      {canMark && (
                        <TableCell className="px-6 py-4">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => toggleOne(item.resident_id, !!next)}
                            aria-label={`Mark ${name} consumed`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-6 py-4 font-medium text-on-surface">{name}</TableCell>
                      <TableCell className="px-6 py-4 text-right text-sm text-on-surface-variant">
                        {checked ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={(next) => {
              setPerPage(next)
              setPage(1)
            }}
          />
        </>
      )}
    </div>
  )
}
