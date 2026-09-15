"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { PortalProfileView } from "@/components/portal/portal-profile-view"

function PortalProfileContent() {
  const searchParams = useSearchParams()

  return <PortalProfileView initialTab={searchParams.get("tab") ?? undefined} />
}

export default function PortalProfilePage() {
  return (
    <Suspense>
      <PortalProfileContent />
    </Suspense>
  )
}
