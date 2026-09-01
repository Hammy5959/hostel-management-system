import type { Metadata } from "next"
import { Suspense } from "react"

import { AdmissionsView } from "@/components/admissions/admissions-view"

export const metadata: Metadata = {
  title: "Admissions",
}

export default function AdmissionsPage() {
  return (
    <Suspense>
      <AdmissionsView />
    </Suspense>
  )
}
