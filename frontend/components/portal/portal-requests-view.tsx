"use client"

import { useState } from "react"

import { PageHeader } from "@/components/hostel/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RequestsLeaveTab } from "@/components/portal/requests-leave-tab"
import { RequestsGatePassesTab } from "@/components/portal/requests-gate-passes-tab"
import { RequestsComplaintsTab } from "@/components/portal/requests-complaints-tab"
import { RequestsVisitorsTab } from "@/components/portal/requests-visitors-tab"

const REQUEST_TABS = ["leave", "gate-passes", "complaints", "visitors"] as const
type RequestTab = (typeof REQUEST_TABS)[number]

function isRequestTab(value: string | null | undefined): value is RequestTab {
  return !!value && (REQUEST_TABS as readonly string[]).includes(value)
}

// Underline-tab styling mirrors portal-finances-view.tsx / resident-detail-view.tsx —
// the real staff-page tab look (TabsList variant="line"), not StubTabsPage's
// default pill variant.
const TAB_TRIGGER_CLASS =
  "rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"

export function PortalRequestsView({
  initialTab,
  autoOpenCreate,
}: {
  initialTab?: string
  /** One-shot signal from a Home page Quick Action deep-link (e.g.
   * ?tab=leave&create=1) to open that tab's create dialog immediately.
   * Only the tab matching `initialTab` ever consumes this — each tab
   * component seeds its own `useState(autoOpenCreate)` once on mount, so
   * the flag never leaks to the other three tabs regardless of how Radix
   * mounts their TabsContent. */
  autoOpenCreate?: boolean
}) {
  const [tab, setTab] = useState<RequestTab>(isRequestTab(initialTab) ? initialTab : "leave")

  return (
    <div className="space-y-6">
      <PageHeader title="My Requests" description="Leave requests, gate passes, complaints, and visitors." />

      <Tabs value={tab} onValueChange={(value) => isRequestTab(value) && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger value="leave" className={TAB_TRIGGER_CLASS}>
              Leave
            </TabsTrigger>
            <TabsTrigger value="gate-passes" className={TAB_TRIGGER_CLASS}>
              Gate Passes
            </TabsTrigger>
            <TabsTrigger value="complaints" className={TAB_TRIGGER_CLASS}>
              Complaints
            </TabsTrigger>
            <TabsTrigger value="visitors" className={TAB_TRIGGER_CLASS}>
              Visitors
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="leave" className="pt-6">
          <RequestsLeaveTab autoOpenCreate={autoOpenCreate && initialTab === "leave"} />
        </TabsContent>
        <TabsContent value="gate-passes" className="pt-6">
          <RequestsGatePassesTab autoOpenCreate={autoOpenCreate && initialTab === "gate-passes"} />
        </TabsContent>
        <TabsContent value="complaints" className="pt-6">
          <RequestsComplaintsTab autoOpenCreate={autoOpenCreate && initialTab === "complaints"} />
        </TabsContent>
        <TabsContent value="visitors" className="pt-6">
          <RequestsVisitorsTab autoOpenCreate={autoOpenCreate && initialTab === "visitors"} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
