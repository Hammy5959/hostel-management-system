import type { Metadata } from "next"
import { Suspense } from "react"

import { AuditLogsView } from "@/components/audit-logs/audit-logs-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = { title: "Audit Logs" }

export default function AuditLogsPage() {
  return (
    <PageAccessGuard permission="audit_logs.view">
      <Suspense>
        <AuditLogsView />
      </Suspense>
    </PageAccessGuard>
  )
}
