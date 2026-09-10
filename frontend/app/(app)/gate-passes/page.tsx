import type { Metadata } from "next"
import { Suspense } from "react"

import { GatePassesView } from "@/components/gate-passes/gate-passes-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Gate Passes",
}

export default function GatePassesPage() {
  return (
    <PageAccessGuard permission={["gate_passes.view", "gate_passes.view_own"]}>
      <Suspense>
        <GatePassesView />
      </Suspense>
    </PageAccessGuard>
  )
}
