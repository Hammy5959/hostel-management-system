import type { Metadata } from "next"
import { Suspense } from "react"

import { ResidentsView } from "@/components/residents/residents-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Residents",
}

export default function ResidentsPage() {
  return (
    <PageAccessGuard permission="residents.view">
      <Suspense>
        <ResidentsView />
      </Suspense>
    </PageAccessGuard>
  )
}
