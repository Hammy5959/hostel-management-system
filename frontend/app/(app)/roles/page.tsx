import type { Metadata } from "next"
import { Suspense } from "react"

import { RolesView } from "@/components/roles/roles-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Roles",
}

export default function RolesPage() {
  return (
    <PageAccessGuard permission={["roles.view", "roles.manage"]}>
      <Suspense>
        <RolesView />
      </Suspense>
    </PageAccessGuard>
  )
}
