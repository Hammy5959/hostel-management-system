import type { Metadata } from "next"
import { Suspense } from "react"

import { ResidentChargesView } from "@/components/resident-charges/resident-charges-view"

export const metadata: Metadata = {
  title: "Resident Charges",
}

export default function ResidentChargesPage() {
  return (
    <Suspense>
      <ResidentChargesView />
    </Suspense>
  )
}
