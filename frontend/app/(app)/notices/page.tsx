import type { Metadata } from "next"
import { Suspense } from "react"

import { NoticesView } from "@/components/notices/notices-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Notices",
}

export default function NoticesPage() {
  // The backend requires no permission to list notices (visibility is
  // scoped by the service itself), so this page needs no gate.
  return (
    <PageAccessGuard permission={null}>
      <Suspense>
        <NoticesView />
      </Suspense>
    </PageAccessGuard>
  )
}
