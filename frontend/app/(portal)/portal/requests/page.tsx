"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { PortalRequestsView } from "@/components/portal/portal-requests-view"

function PortalRequestsContent() {
  const searchParams = useSearchParams()

  return (
    <PortalRequestsView
      initialTab={searchParams.get("tab") ?? undefined}
      autoOpenCreate={searchParams.get("create") === "1"}
    />
  )
}

export default function PortalRequestsPage() {
  return (
    <Suspense>
      <PortalRequestsContent />
    </Suspense>
  )
}
