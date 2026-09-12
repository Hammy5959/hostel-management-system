"use client"

import { useState } from "react"

import { PageHeader } from "@/components/hostel/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FinancesInvoicesTab } from "@/components/portal/finances-invoices-tab"
import { FinancesPaymentsTab } from "@/components/portal/finances-payments-tab"
import { FinancesChargesTab } from "@/components/portal/finances-charges-tab"

const FINANCE_TABS = ["invoices", "payments", "charges"] as const
type FinanceTab = (typeof FINANCE_TABS)[number]

function isFinanceTab(value: string | null | undefined): value is FinanceTab {
  return !!value && (FINANCE_TABS as readonly string[]).includes(value)
}

// Underline-tab styling mirrors resident-detail-view.tsx / mess-view.tsx —
// the real staff-page tab look (TabsList variant="line"), not StubTabsPage's
// default pill variant.
const TAB_TRIGGER_CLASS =
  "rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"

export function PortalFinancesView({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<FinanceTab>(isFinanceTab(initialTab) ? initialTab : "invoices")

  return (
    <div className="space-y-6">
      <PageHeader title="My Finances" description="Invoices, payments, and charges for your stay." />

      <Tabs value={tab} onValueChange={(value) => isFinanceTab(value) && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger value="invoices" className={TAB_TRIGGER_CLASS}>
              Invoices
            </TabsTrigger>
            <TabsTrigger value="payments" className={TAB_TRIGGER_CLASS}>
              Payments
            </TabsTrigger>
            <TabsTrigger value="charges" className={TAB_TRIGGER_CLASS}>
              Charges
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="invoices" className="pt-6">
          <FinancesInvoicesTab />
        </TabsContent>
        <TabsContent value="payments" className="pt-6">
          <FinancesPaymentsTab />
        </TabsContent>
        <TabsContent value="charges" className="pt-6">
          <FinancesChargesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
