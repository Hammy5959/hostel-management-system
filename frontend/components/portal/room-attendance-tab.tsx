"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react"

import { cn, todayLocalDate } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/hostel/error-state"
import { getAttendance } from "@/lib/api"
import type { AttendanceStatus } from "@/lib/types"

/** Mirrors ATTENDANCE_STATUS_LABEL/TONE in components/attendance/attendance-view.tsx
 * (the staff view) so the resident sees the same terminology — "excused"
 * reads as "On Leave" there too. Kept local rather than imported since the
 * staff component doesn't export these and portal components shouldn't
 * reach into staff-view internals. */
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "On Leave",
}

const STATUS_CELL_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  absent: "bg-error-container text-on-error-container border-error-container",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  excused: "bg-blue-50 text-blue-700 border-blue-200",
}

const STATUS_DOT_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  absent: "bg-destructive",
  late: "bg-amber-500",
  excused: "bg-blue-500",
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number)
  return { year, month, day }
}

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function RoomAttendanceTab() {
  const today = parseLocalDate(todayLocalDate())
  const [year, setYear] = useState(today.year)
  const [month, setMonth] = useState(today.month)

  const isCurrentMonth = year === today.year && month === today.month

  function goToPrevMonth() {
    setMonth((m) => {
      if (m === 1) {
        setYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }

  function goToNextMonth() {
    if (isCurrentMonth) return
    setMonth((m) => {
      if (m === 12) {
        setYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }

  const dateFrom = `${year}-${pad2(month)}-01`
  const dateTo = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

  const query = useQuery({
    queryKey: ["my-attendance", year, month],
    queryFn: () => getAttendance({ date_from: dateFrom, date_to: dateTo, per_page: 31 }),
  })

  const recordByDate = useMemo(() => {
    const map = new Map<string, AttendanceStatus>()
    for (const record of query.data?.items ?? []) {
      map.set(record.attendance_date, record.status)
    }
    return map
  }, [query.data])

  const counts = useMemo(() => {
    const result: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 }
    for (const status of recordByDate.values()) result[status]++
    return result
  }, [recordByDate])

  const total = recordByDate.size
  const totalDays = daysInMonth(year, month)
  const leadingBlanks = firstWeekday(year, month)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-on-surface">{monthLabel(year, month)}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={goToPrevMonth}
            className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={isCurrentMonth}
            onClick={goToNextMonth}
            className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : query.isError ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        </div>
      ) : (
        <>
          {/* Month summary */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            {total === 0 ? (
              <div className="flex items-center gap-3 py-2">
                <CalendarX aria-hidden className="size-6 text-outline" />
                <p className="text-sm text-on-surface-variant">No attendance marked this month.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">Attendance</p>
                  <p className="text-2xl font-semibold tracking-tight text-on-surface">
                    {Math.round((counts.present / total) * 100)}%
                  </p>
                  <p className="text-xs text-on-surface-variant">of {total} marked days</p>
                </div>
                {(["present", "absent", "late", "excused"] as const).map((status) => (
                  <div key={status}>
                    <p className="text-xs font-medium text-on-surface-variant">{STATUS_LABEL[status]}</p>
                    <p className="text-2xl font-semibold tracking-tight text-on-surface">{counts[status]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="pb-1 text-center text-xs font-medium text-on-surface-variant">
                  {label}
                </div>
              ))}

              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}

              {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                const dateKey = `${year}-${pad2(month)}-${pad2(day)}`
                const status = recordByDate.get(dateKey)
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border text-sm",
                      status
                        ? STATUS_CELL_CLASS[status]
                        : "border-outline-variant bg-surface-container-lowest text-on-surface-variant",
                    )}
                  >
                    {day}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-outline-variant pt-4">
              {(["present", "absent", "late", "excused"] as const).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-full", STATUS_DOT_CLASS[status])} />
                  <span className="text-xs text-on-surface-variant">{STATUS_LABEL[status]}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border border-outline-variant" />
                <span className="text-xs text-on-surface-variant">Not marked</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
