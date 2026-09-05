import type { Metadata } from "next"
import { Suspense } from "react"

import { NoticesView } from "@/components/notices/notices-view"

export const metadata: Metadata = {
  title: "Notices",
}

export default function NoticesPage() {
  return (
    <Suspense>
      <NoticesView />
    </Suspense>
  )
}
