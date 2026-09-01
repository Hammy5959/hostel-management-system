import type { Metadata } from "next"
import { Suspense } from "react"

import { RoomDetailView } from "@/components/rooms/room-detail-view"

export const metadata: Metadata = {
  title: "Room Bed Management",
}

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ room_id: string }>
}) {
  const { room_id } = await params

  return (
    <Suspense>
      <RoomDetailView roomId={room_id} />
    </Suspense>
  )
}
