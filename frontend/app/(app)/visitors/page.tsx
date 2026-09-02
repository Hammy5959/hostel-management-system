import type { Metadata } from "next"
import { Suspense } from "react"

import { VisitorsView } from "@/components/visitors/visitors-view"

export const metadata: Metadata = {
  title: "Visitors",
}

export default function VisitorsPage() {
  return (
    <Suspense>
      <VisitorsView />
    </Suspense>
  )
}
