import type { Metadata } from "next"
import { Suspense } from "react"

import { AssetsView } from "@/components/assets/assets-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Assets",
}

export default function AssetsPage() {
  return (
    <PageAccessGuard permission="assets.view">
      <Suspense>
        <AssetsView />
      </Suspense>
    </PageAccessGuard>
  )
}
