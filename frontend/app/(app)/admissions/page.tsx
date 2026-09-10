import type { Metadata } from "next"
import { Suspense } from "react"

import { AdmissionsView } from "@/components/admissions/admissions-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Admissions",
}

export default function AdmissionsPage() {
  return (
    <PageAccessGuard permission={["admissions.view", "admissions.view_own"]}>
      <Suspense>
        <AdmissionsView />
      </Suspense>
    </PageAccessGuard>
  )
}
