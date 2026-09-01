import type { Metadata } from "next"
import { Suspense } from "react"

import { AllocationsView } from "@/components/allocations/allocations-view"

export const metadata: Metadata = {
  title: "Room Allocations",
}

export default function AllocationsPage() {
  return (
    <Suspense>
      <AllocationsView />
    </Suspense>
  )
}
