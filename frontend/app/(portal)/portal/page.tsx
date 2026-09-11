"use client"

import { UserRound } from "lucide-react"

import { useMyResident } from "@/components/portal/resident-provider"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Skeleton } from "@/components/ui/skeleton"

export default function PortalHomePage() {
  const { resident, isLoading, error, refetch } = useMyResident()

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  if (error) {
    return <ErrorState message="Something went wrong loading your profile." onRetry={refetch} />
  }

  if (!resident) {
    return (
      <EmptyState
        icon={UserRound}
        title="No resident profile linked"
        description="Contact the hostel office to link your account."
      />
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
        Welcome, {resident.first_name}
      </h1>
      <p className="text-sm text-on-surface-variant">Resident Portal — under construction.</p>
    </div>
  )
}
