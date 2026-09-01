import type { Metadata } from "next"
import { Suspense } from "react"

import { ResidentsView } from "@/components/residents/residents-view"

export const metadata: Metadata = {
  title: "Residents",
}

export default function ResidentsPage() {
  return (
    <Suspense>
      <ResidentsView />
    </Suspense>
  )
}
