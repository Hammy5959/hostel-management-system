import type { Metadata } from "next"
import { Suspense } from "react"

import { RoomsView } from "@/components/rooms/rooms-view"
import { PageAccessGuard } from "@/components/hostel/page-access-guard"

export const metadata: Metadata = {
  title: "Rooms",
}

export default function RoomsPage() {
  return (
    <PageAccessGuard permission="rooms.view">
      <Suspense>
        <RoomsView />
      </Suspense>
    </PageAccessGuard>
  )
}
