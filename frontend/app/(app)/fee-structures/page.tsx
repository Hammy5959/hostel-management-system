import type { Metadata } from "next"
import { Suspense } from "react"

import { FeeStructuresView } from "@/components/fee-structures/fee-structures-view"

export const metadata: Metadata = {
  title: "Fee Structures",
}

export default function FeeStructuresPage() {
  return (
    <Suspense>
      <FeeStructuresView />
    </Suspense>
  )
}
