import type { Metadata } from "next"
import { Suspense } from "react"

import { UsersView } from "@/components/users/users-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Users",
}

export default function UsersPage() {
  return (
    <PageAccessGuard permission="users.view">
      <Suspense>
        <UsersView />
      </Suspense>
    </PageAccessGuard>
  )
}
