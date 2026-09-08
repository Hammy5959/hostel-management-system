import type { Metadata } from "next"
import { Suspense } from "react"

import { RolesView } from "@/components/roles/roles-view"

export const metadata: Metadata = {
  title: "Roles",
}

export default function RolesPage() {
  return (
    <Suspense>
      <RolesView />
    </Suspense>
  )
}
