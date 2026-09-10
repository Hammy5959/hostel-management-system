import type { Metadata } from "next"
import { Suspense } from "react"

import { LeaveRequestsView } from "@/components/leave-requests/leave-requests-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Leave Requests",
}

export default function LeaveRequestsPage() {
  return (
    <PageAccessGuard permission={["leave_requests.view", "leave_requests.view_own"]}>
      <Suspense>
        <LeaveRequestsView />
      </Suspense>
    </PageAccessGuard>
  )
}
