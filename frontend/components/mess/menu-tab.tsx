"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { addWeeks, eachDayOfInterval, endOfWeek, format, startOfWeek, subWeeks } from "date-fns"
import { ChevronLeft, ChevronRight, Moon, Pencil, Plus, ShieldOff, Sun, Sunrise, Trash2, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"

import { todayLocalDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, deleteMessMenu, getMessMenus } from "@/lib/api"
import type { MenuOut } from "@/lib/types"
import { MenuFormDialog } from "@/components/mess/menu-form-dialog"

const MEAL_SECTIONS: { key: "breakfast" | "lunch" | "dinner"; label: string; icon: typeof Sunrise }[] = [
  { key: "breakfast", label: "Breakfast", icon: Sunrise },
  { key: "lunch", label: "Lunch", icon: Sun },
  { key: "dinner", label: "Dinner", icon: Moon },
]

export function MenuTab() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [formTarget, setFormTarget] = useState<{ menu: MenuOut | null; defaultDate: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MenuOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canCreate = has("mess_menus.create")
  const canUpdate = has("mess_menus.update")
  const canDelete = has("mess_menus.delete")

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekStartISO = format(weekStart, "yyyy-MM-dd")
  const weekEndISO = format(weekEnd, "yyyy-MM-dd")
  const isCurrentWeek = weekStartISO === format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  const today = todayLocalDate()

  const query = useQuery({
    queryKey: ["mess-menus", weekStartISO],
    queryFn: () => getMessMenus({ date_from: weekStartISO, date_to: weekEndISO, per_page: 20 }),
  })

  const menuByDate = useMemo(() => {
    const map = new Map<string, MenuOut>()
    for (const menu of query.data?.items ?? []) {
      map.set(menu.menu_date, menu)
    }
    return map
  }, [query.data])

  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteMessMenu(deleteTarget.id)
      toast.success("Menu deleted.")
      queryClient.invalidateQueries({ queryKey: ["mess-menus"] })
      queryClient.invalidateQueries({ queryKey: ["mess-menus-week-stats"] })
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("mess_menus.delete")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart((prev) => subWeeks(prev, 1))}
            className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <div className="text-sm font-medium text-on-surface">
            {isCurrentWeek ? "This Week" : "Week"} ({format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")})
          </div>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((prev) => addWeeks(prev, 1))}
            className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
          {!isCurrentWeek && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              This Week
            </Button>
          )}
        </div>
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Mess Menus"
          description="Ask an administrator to grant you the mess_menus.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {days.map((day) => {
            const dateISO = format(day, "yyyy-MM-dd")
            const menu = menuByDate.get(dateISO)
            const isToday = dateISO === today

            return (
              <div
                key={dateISO}
                className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{format(day, "EEEE")}</p>
                    <p className="text-xs text-on-surface-variant">{format(day, "MMM d")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isToday && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Today
                      </span>
                    )}
                    {menu && canUpdate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit menu for ${format(day, "EEEE, MMM d")}`}
                        onClick={() => setFormTarget({ menu, defaultDate: dateISO })}
                        className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                    )}
                    {menu && canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete menu for ${format(day, "EEEE, MMM d")}`}
                        onClick={() => setDeleteTarget(menu)}
                        className="rounded-full text-on-surface-variant hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {menu ? (
                  <div className="flex-1 space-y-3">
                    {MEAL_SECTIONS.map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-start gap-2">
                        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-on-surface-variant" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold tracking-wide text-on-surface-variant uppercase">
                            {label}
                          </p>
                          <p className="truncate text-sm text-on-surface">{menu[key] || "Not set"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
                    <UtensilsCrossed aria-hidden className="size-6 text-on-surface-variant" strokeWidth={1.75} />
                    <p className="text-sm text-on-surface-variant">No menu set</p>
                    {canCreate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormTarget({ menu: null, defaultDate: dateISO })}
                      >
                        <Plus aria-hidden className="size-4" />
                        Add
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <MenuFormDialog
        open={!!formTarget}
        onOpenChange={(open) => !open && setFormTarget(null)}
        menu={formTarget?.menu ?? null}
        defaultDate={formTarget?.defaultDate ?? today}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete menu"
        description={
          deleteTarget
            ? `This will permanently delete the menu for ${format(new Date(`${deleteTarget.menu_date}T00:00:00`), "EEEE, MMM d, yyyy")}.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
