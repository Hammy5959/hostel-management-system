import type { Metadata } from "next"
import { Suspense } from "react"

import { GatePassesView } from "@/components/gate-passes/gate-passes-view"

export const metadata: Metadata = {
  title: "Gate Passes",
}

export default function GatePassesPage() {
  return (
    <Suspense>
      <GatePassesView />
    </Suspense>
  )
}
