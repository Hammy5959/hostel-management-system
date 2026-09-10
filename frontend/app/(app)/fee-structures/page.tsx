import type { Metadata } from "next"
import { Suspense } from "react"

import { FeeStructuresView } from "@/components/fee-structures/fee-structures-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Fee Structures",
}

export default function FeeStructuresPage() {
  return (
    <PageAccessGuard permission="fee_structures.view">
      <Suspense>
        <FeeStructuresView />
      </Suspense>
    </PageAccessGuard>
  )
}
