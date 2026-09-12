"use client"

import { useQuery } from "@tanstack/react-query"
import { Receipt } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { formatCurrency } from "@/lib/utils"
import { getPayments } from "@/lib/api"

// Mirrors invoice-detail-dialog.tsx's METHOD_LABEL so a payment reads the
// same here as it does inside an invoice's payment history.
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  online: "Online",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function FinancesPaymentsTab() {
  const query = useQuery({ queryKey: ["my-payments"], queryFn: () => getPayments({}) })

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  const payments = query.data?.items ?? []

  if (payments.length === 0) {
    return <EmptyState icon={Receipt} title="No payments yet" description="Payments you've made will appear here." />
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="text-on-surface-variant">{formatDate(payment.payment_date)}</TableCell>
              <TableCell className="font-medium text-on-surface">{formatCurrency(payment.amount)}</TableCell>
              <TableCell className="text-on-surface-variant">
                {payment.payment_method ? METHOD_LABEL[payment.payment_method] ?? payment.payment_method : "—"}
              </TableCell>
              <TableCell className="text-on-surface-variant">{payment.invoice?.invoice_number ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
