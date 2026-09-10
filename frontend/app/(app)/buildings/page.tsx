import type { Metadata } from "next"

import { BuildingsView } from "@/components/buildings/buildings-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Buildings",
}

export default function BuildingsPage() {
  return (
    <PageAccessGuard permission="buildings.view">
      <BuildingsView />
    </PageAccessGuard>
  )
}
