import type { Metadata } from "next"
import { Suspense } from "react"

import { ResidentDetailView } from "@/components/residents/resident-detail-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Resident Profile",
}

export default async function ResidentDetailPage({
  params,
}: {
  params: Promise<{ resident_id: string }>
}) {
  const { resident_id } = await params

  return (
    <PageAccessGuard permission="residents.view">
      <Suspense>
        <ResidentDetailView residentId={resident_id} />
      </Suspense>
    </PageAccessGuard>
  )
}
