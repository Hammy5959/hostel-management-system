import type { Metadata } from "next"
import { Suspense } from "react"

import { MaintenanceView } from "@/components/maintenance/maintenance-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Maintenance",
}

export default function MaintenancePage() {
  return (
    <PageAccessGuard permission="maintenance_tickets.view">
      <Suspense>
        <MaintenanceView />
      </Suspense>
    </PageAccessGuard>
  )
}
