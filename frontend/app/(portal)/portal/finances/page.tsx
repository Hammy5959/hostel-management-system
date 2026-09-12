"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { PortalFinancesView } from "@/components/portal/portal-finances-view"

function PortalFinancesContent() {
  const searchParams = useSearchParams()

  return <PortalFinancesView initialTab={searchParams.get("tab") ?? undefined} />
}

export default function PortalFinancesPage() {
  return (
    <Suspense>
      <PortalFinancesContent />
    </Suspense>
  )
}
