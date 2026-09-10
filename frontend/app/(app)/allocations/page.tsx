import type { Metadata } from "next"
import { Suspense } from "react"

import { AllocationsView } from "@/components/allocations/allocations-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Room Allocations",
}

export default function AllocationsPage() {
  return (
    <PageAccessGuard permission={["allocations.view", "allocations.view_own"]}>
      <Suspense>
        <AllocationsView />
      </Suspense>
    </PageAccessGuard>
  )
}
