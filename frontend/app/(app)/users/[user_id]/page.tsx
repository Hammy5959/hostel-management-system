import type { Metadata } from "next"
import { Suspense } from "react"

import { UserDetailView } from "@/components/users/user-detail-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "User Profile",
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ user_id: string }>
}) {
  const { user_id } = await params

  return (
    <PageAccessGuard permission="users.view" allowSelfId={user_id}>
      <Suspense>
        <UserDetailView userId={user_id} />
      </Suspense>
    </PageAccessGuard>
  )
}
