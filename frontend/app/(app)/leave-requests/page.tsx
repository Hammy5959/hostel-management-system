import type { Metadata } from "next"
import { Suspense } from "react"

import { LeaveRequestsView } from "@/components/leave-requests/leave-requests-view"

export const metadata: Metadata = {
  title: "Leave Requests",
}

export default function LeaveRequestsPage() {
  return (
    <Suspense>
      <LeaveRequestsView />
    </Suspense>
  )
}
