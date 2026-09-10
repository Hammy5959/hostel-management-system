import type { Metadata } from "next"
import { Suspense } from "react"

import { AttendanceView } from "@/components/attendance/attendance-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Daily Attendance",
}

export default function AttendancePage() {
  return (
    <PageAccessGuard permission={["attendance.view", "attendance.view_own"]}>
      <Suspense>
        <AttendanceView />
      </Suspense>
    </PageAccessGuard>
  )
}
