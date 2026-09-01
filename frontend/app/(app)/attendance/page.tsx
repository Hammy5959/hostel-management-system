import type { Metadata } from "next"
import { Suspense } from "react"

import { AttendanceView } from "@/components/attendance/attendance-view"

export const metadata: Metadata = {
  title: "Daily Attendance",
}

export default function AttendancePage() {
  return (
    <Suspense>
      <AttendanceView />
    </Suspense>
  )
}
