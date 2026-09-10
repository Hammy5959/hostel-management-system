import type { Metadata } from "next"
import { Suspense } from "react"

import { VisitorsView } from "@/components/visitors/visitors-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Visitors",
}

export default function VisitorsPage() {
  return (
    <PageAccessGuard permission={["visitors.view", "visitors.view_own"]}>
      <Suspense>
        <VisitorsView />
      </Suspense>
    </PageAccessGuard>
  )
}
