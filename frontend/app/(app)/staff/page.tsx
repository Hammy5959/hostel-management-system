import type { Metadata } from "next"
import { Suspense } from "react"

import { StaffView } from "@/components/staff/staff-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Staff",
}

export default function StaffPage() {
  return (
    <PageAccessGuard permission="staff.view">
      <Suspense>
        <StaffView />
      </Suspense>
    </PageAccessGuard>
  )
}
