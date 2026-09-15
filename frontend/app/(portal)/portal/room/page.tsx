"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { PortalRoomView } from "@/components/portal/portal-room-view"

function PortalRoomContent() {
  const searchParams = useSearchParams()

  return <PortalRoomView initialTab={searchParams.get("tab") ?? undefined} />
}

export default function PortalRoomPage() {
  return (
    <Suspense>
      <PortalRoomContent />
    </Suspense>
  )
}
