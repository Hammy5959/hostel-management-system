import type { Metadata } from "next"
import { Suspense } from "react"

import { AssetsView } from "@/components/assets/assets-view"

export const metadata: Metadata = {
  title: "Assets",
}

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsView />
    </Suspense>
  )
}
