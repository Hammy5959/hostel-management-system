"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { endOfWeek, startOfWeek } from "date-fns"
import { BadgeCheck, CalendarDays, Users, UtensilsCrossed } from "lucide-react"

import { cn, todayLocalDate } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { usePermissions } from "@/lib/permissions"
import { getMealsRegister, getMessMenus } from "@/lib/api"
import { MenuTab } from "@/components/mess/menu-tab"
import { MealsTab } from "@/components/mess/meals-tab"

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  hint,
}: {
  icon: typeof Users
  iconClassName: string
  label: string
  value: number | string | undefined
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-10 items-center justify-center rounded-full", iconClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <>
          <p className="text-[32px] leading-none font-bold text-on-surface">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {hint && <p className="mt-1.5 text-xs text-on-surface-variant">{hint}</p>}
        </>
      )}
    </div>
  )
}

export function MessView() {
  const { has } = usePermissions()
  const [tab, setTab] = useState<"menu" | "meals">("menu")

  const canViewMenus = has("mess_menus.view")
  const canViewMeals = has("meals.view")

  const today = todayLocalDate()
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const currentWeekStartISO = currentWeekStart.toISOString().slice(0, 10)
  const currentWeekEndISO = currentWeekEnd.toISOString().slice(0, 10)

  const weekMenusQuery = useQuery({
    queryKey: ["mess-menus-week-stats", currentWeekStartISO],
    queryFn: () => getMessMenus({ date_from: currentWeekStartISO, date_to: currentWeekEndISO, per_page: 20 }),
    enabled: canViewMenus,
  })

  const breakfastRegisterQuery = useQuery({
    queryKey: ["meals-register", today, "breakfast"],
    queryFn: () => getMealsRegister({ meal_date: today, meal_type: "breakfast" }),
    enabled: canViewMeals,
  })
  const lunchRegisterQuery = useQuery({
    queryKey: ["meals-register", today, "lunch"],
    queryFn: () => getMealsRegister({ meal_date: today, meal_type: "lunch" }),
    enabled: canViewMeals,
  })
  const dinnerRegisterQuery = useQuery({
    queryKey: ["meals-register", today, "dinner"],
    queryFn: () => getMealsRegister({ meal_date: today, meal_type: "dinner" }),
    enabled: canViewMeals,
  })

  const mealsServedToday =
    canViewMeals && breakfastRegisterQuery.data && lunchRegisterQuery.data && dinnerRegisterQuery.data
      ? [breakfastRegisterQuery.data, lunchRegisterQuery.data, dinnerRegisterQuery.data].reduce(
          (sum, register) => sum + register.items.filter((item) => item.consumed).length,
          0,
        )
      : undefined

  const totalResidents = canViewMeals ? breakfastRegisterQuery.data?.total : undefined
  const todaysMenuSet = canViewMenus
    ? weekMenusQuery.data
      ? weekMenusQuery.data.items.some((menu) => menu.menu_date === today)
        ? "Yes"
        : "No"
      : undefined
    : undefined

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Mess Menus & Meals" }]} />

        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
            Mess Menus & Meals
          </h1>
          <p className="mt-2 text-base leading-6 text-on-surface-variant">
            Plan weekly mess menus and mark resident meal consumption.
          </p>
        </div>
      </div>

      {(canViewMenus || canViewMeals) && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {canViewMenus && (
            <StatCard
              icon={CalendarDays}
              iconClassName="bg-primary/10 text-primary"
              label="This Week's Menus"
              value={weekMenusQuery.data?.items.length}
              hint="Days scheduled this week"
            />
          )}
          {canViewMeals && (
            <StatCard
              icon={UtensilsCrossed}
              iconClassName="bg-emerald-50 text-emerald-600"
              label="Meals Served Today"
              value={mealsServedToday}
              hint="Across breakfast, lunch & dinner"
            />
          )}
          {canViewMeals && (
            <StatCard
              icon={Users}
              iconClassName="bg-blue-50 text-blue-600"
              label="Total Residents"
              value={totalResidents}
              hint="Eligible for meals"
            />
          )}
          {canViewMenus && (
            <StatCard
              icon={BadgeCheck}
              iconClassName="bg-secondary-container text-on-secondary-container"
              label="Today's Menu Set"
              value={todaysMenuSet}
            />
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => (value === "menu" || value === "meals") && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="menu"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Menu
            </TabsTrigger>
            <TabsTrigger
              value="meals"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Meals
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="menu" className="pt-6">
          <MenuTab />
        </TabsContent>

        <TabsContent value="meals" className="pt-6">
          <MealsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
