import type { Metadata } from "next"
import { Suspense } from "react"

import { UserDetailView } from "@/components/users/user-detail-view"

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
    <Suspense>
      <UserDetailView userId={user_id} />
    </Suspense>
  )
}
