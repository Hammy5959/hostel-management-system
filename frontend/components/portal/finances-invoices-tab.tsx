"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CircleCheck, FileText, Wallet } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { InvoiceDetailDialog } from "@/components/invoices/invoice-detail-dialog"
import { cn, formatCurrency } from "@/lib/utils"
import { getInvoices } from "@/lib/api"
import type { Invoice, InvoiceStatus } from "@/lib/types"

const PENDING_STATUSES = new Set<InvoiceStatus>(["issued", "partially_paid", "overdue"])

// Collapses the full InvoiceStatus range into the 3 resident-facing buckets,
// plus "Cancelled" so a cancelled invoice is never mislabeled as paid/unpaid.
function invoiceBadge(status: InvoiceStatus): { label: string; tone: Tone } {
  if (status === "paid") return { label: "Paid", tone: "success" }
  if (status === "overdue") return { label: "Overdue", tone: "danger" }
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral" }
  return { label: "Unpaid", tone: "warning" } // issued, partially_paid, draft
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function SummaryChip({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Wallet
  iconClassName: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        <Icon aria-hidden className="size-4.5" />
      </div>
      <div>
        <p className="text-xs font-medium text-on-surface-variant">{label}</p>
        <p className="text-lg font-semibold text-on-surface">{value}</p>
      </div>
    </div>
  )
}

export function FinancesInvoicesTab() {
  const query = useQuery({ queryKey: ["my-invoices"], queryFn: () => getInvoices({}) })
  const [viewing, setViewing] = useState<Invoice | null>(null)

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  const invoices = query.data?.items ?? []

  if (invoices.length === 0) {
    return <EmptyState icon={FileText} title="No invoices yet" description="Invoices for your stay will appear here." />
  }

  const totalDue = invoices.reduce(
    (sum, inv) => (PENDING_STATUSES.has(inv.status) ? sum + Number(inv.balance) : sum),
    0,
  )
  const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryChip
          icon={Wallet}
          iconClassName="bg-error-container text-on-error-container"
          label="Total Due"
          value={formatCurrency(totalDue)}
        />
        <SummaryChip
          icon={CircleCheck}
          iconClassName="bg-success-bg text-success"
          label="Total Paid"
          value={formatCurrency(totalPaid)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const badge = invoiceBadge(invoice.status)
              return (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => setViewing(invoice)}
                >
                  <TableCell>
                    <p className="font-medium text-on-surface">{invoice.invoice_number}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(invoice.issue_date)}</p>
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatCurrency(invoice.total_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} tone={badge.tone} label={badge.label} />
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatDate(invoice.due_date)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <InvoiceDetailDialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} invoice={viewing} />
    </div>
  )
}
