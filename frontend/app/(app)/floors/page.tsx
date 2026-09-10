import type { Metadata } from "next"

import { FloorsView } from "@/components/floors/floors-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Floors",
}

export default function FloorsPage() {
  return (
    <PageAccessGuard permission="floors.view">
      <FloorsView />
    </PageAccessGuard>
  )
}
