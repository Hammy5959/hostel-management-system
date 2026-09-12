"use client"

import { useQuery } from "@tanstack/react-query"
import { Receipt } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { formatCurrency } from "@/lib/utils"
import { getResidentCharges } from "@/lib/api"
import type { ResidentChargeStatus } from "@/lib/types"

// Real status shown (not force-collapsed to only Invoiced/Pending) — a
// charge that's actually paid/overdue/waived shouldn't be mislabeled.
const CHARGE_STATUS_TONE: Record<ResidentChargeStatus, Tone> = {
  pending: "warning",
  invoiced: "info",
  paid: "success",
  partially_paid: "warning",
  overdue: "danger",
  waived: "neutral",
  cancelled: "neutral",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function FinancesChargesTab() {
  const query = useQuery({ queryKey: ["my-charges"], queryFn: () => getResidentCharges({}) })

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  const charges = query.data?.items ?? []

  if (charges.length === 0) {
    return <EmptyState icon={Receipt} title="No charges yet" description="Charges added to your account will appear here." />
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Fee Structure</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((charge) => (
            <TableRow key={charge.id}>
              <TableCell className="font-medium text-on-surface">
                {charge.description ?? charge.charge_type}
              </TableCell>
              <TableCell className="text-on-surface-variant">{formatCurrency(charge.amount)}</TableCell>
              <TableCell className="text-on-surface-variant">{formatDate(charge.charge_date)}</TableCell>
              <TableCell className="text-on-surface-variant">{charge.fee_structure?.name ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge status={charge.status} tone={CHARGE_STATUS_TONE[charge.status]} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
