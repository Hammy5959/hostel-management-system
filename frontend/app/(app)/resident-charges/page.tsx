import type { Metadata } from "next"
import { Suspense } from "react"

import { ResidentChargesView } from "@/components/resident-charges/resident-charges-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Resident Charges",
}

export default function ResidentChargesPage() {
  return (
    <PageAccessGuard permission="resident_charges.view">
      <Suspense>
        <ResidentChargesView />
      </Suspense>
    </PageAccessGuard>
  )
}
