"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { StubTabsPage } from "@/components/portal/stub-tabs-page"

const TABS = [
  { value: "leave", label: "Leave" },
  { value: "gate-passes", label: "Gate Passes" },
  { value: "complaints", label: "Complaints" },
  { value: "visitors", label: "Visitors" },
]

function PortalRequestsContent() {
  const searchParams = useSearchParams()

  return (
    <StubTabsPage
      title="My Requests"
      description="Leave requests, gate passes, complaints, and visitors."
      tabs={TABS}
      initialTab={searchParams.get("tab") ?? undefined}
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
