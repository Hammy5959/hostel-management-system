"use client";

import { useState } from "react";
import { BarChart3, Bed, Handshake, Package2, UserCheck2, Wallet } from "lucide-react";

import { PageHeader } from "@/components/hostel/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker, getPresetRange, DEFAULT_DATE_PRESET, type DateRange } from "@/components/reports/date-range-picker";
import { OverviewTab } from "@/components/reports/overview-tab";
import { OccupancyTab } from "@/components/reports/occupancy-tab";
import { FinanceTab } from "@/components/reports/finance-tab";
import { ResidentsTab } from "@/components/reports/residents-tab";
import { OperationsTab } from "@/components/reports/operations-tab";
import { FacilitiesTab } from "@/components/reports/facilities-tab";

type ReportTab = "overview" | "occupancy" | "finance" | "residents" | "operations" | "facilities";

const TAB_TRIGGER_CLASS =
  "rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary";

const TABS: { value: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "occupancy", label: "Occupancy", icon: Bed },
  { value: "finance", label: "Finance", icon: Wallet },
  { value: "residents", label: "Residents", icon: UserCheck2 },
  { value: "operations", label: "Operations", icon: Handshake },
  { value: "facilities", label: "Facilities", icon: Package2 },
];

export function ReportsView() {
  const [tab, setTab] = useState<ReportTab>("overview");
  const [range, setRange] = useState<DateRange>(() => getPresetRange(DEFAULT_DATE_PRESET));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Occupancy, finance, resident, and operational insights across the hostel."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (TABS.some((t) => t.value === value)) setTab(value as ReportTab);
        }}
      >
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 overflow-x-auto bg-transparent p-0">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className={TAB_TRIGGER_CLASS}>
                <Icon aria-hidden className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6 pt-6">
          <OverviewTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
        </TabsContent>
        <TabsContent value="occupancy" className="space-y-6 pt-6">
          <OccupancyTab />
        </TabsContent>
        <TabsContent value="finance" className="space-y-6 pt-6">
          <FinanceTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
        </TabsContent>
        <TabsContent value="residents" className="space-y-6 pt-6">
          <ResidentsTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
        </TabsContent>
        <TabsContent value="operations" className="space-y-6 pt-6">
          <OperationsTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
        </TabsContent>
        <TabsContent value="facilities" className="space-y-6 pt-6">
          <FacilitiesTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
