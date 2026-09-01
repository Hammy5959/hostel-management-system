"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

import { cn, formatCurrency } from "@/lib/utils";
import { getPayments } from "@/lib/api";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

// Mirrors payments-view.tsx's METHOD_LABEL so a payment reads the same here
// as it does on its own Payments-page card.
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  online: "Online",
};

// Mirrors invoices-view.tsx's STATUS_BADGE_TONE so the badge here reads the
// same as the card it was opened from.
const STATUS_BADGE_TONE: Record<InvoiceStatus, string> = {
  draft: "border-outline-variant bg-surface-variant text-on-surface-variant",
  issued: "border-blue-200 bg-blue-100 text-blue-800",
  partially_paid: "border-amber-200 bg-amber-100 text-amber-800",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
  overdue: "border-error/30 bg-error-container text-error",
  cancelled: "border-error/30 bg-error-container text-error",
};

function initials(firstName: string, lastName: string | null): string {
  return `${firstName[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Which two dates to show and how to label them — mirrors
 * invoices-view.tsx's InvoiceDates so the card and this dialog always agree. */
function dateFields(invoice: Invoice): {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
} {
  if (invoice.status === "draft") {
    return {
      leftLabel: "Created date",
      leftValue: formatDate(invoice.created_at),
      rightLabel: "Due date",
      rightValue: formatDate(invoice.due_date),
    };
  }
  if (invoice.status === "cancelled") {
    return {
      leftLabel: "Issue date",
      leftValue: formatDate(invoice.issue_date),
      rightLabel: "Cancelled date",
      rightValue: formatDate(invoice.updated_at),
    };
  }
  return {
    leftLabel: "Issue date",
    leftValue: formatDate(invoice.issue_date),
    rightLabel: "Due date",
    rightValue: formatDate(invoice.due_date),
  };
}

/** Read-only invoice detail — the "View" button on issued/partially-paid/
 * paid/cancelled cards. `items`/`resident` are already embedded per invoice
 * (app.invoices.service._SELECT), so only the payment history needs its own
 * fetch — GET /payments filtered by invoice_id, the same endpoint the
 * Payments page itself uses. */
export function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}) {
  // Hooks must run unconditionally, so this sits above the `!invoice` guard
  // below — a draft can never have payments, so it's skipped to avoid a
  // pointless fetch every time a draft card is opened.
  const paymentsQuery = useQuery({
    queryKey: ["payments", { invoice_id: invoice?.id }],
    queryFn: () => getPayments({ invoice_id: invoice!.id, per_page: 100 }),
    enabled: open && !!invoice && invoice.status !== "draft",
  });

  if (!invoice) return null;

  const payments = paymentsQuery.data?.items ?? [];
  const resident = invoice.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const dates = dateFields(invoice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{invoice.invoice_number}</DialogTitle>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                STATUS_BADGE_TONE[invoice.status],
              )}
            >
              {STATUS_LABEL[invoice.status]}
            </span>
          </div>
          <DialogDescription>Invoice details and line items.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border border-outline-variant">
              <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={residentName} />
              <AvatarFallback>{resident ? initials(resident.first_name, resident.last_name) : "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold text-on-surface">{residentName}</p>
              <p className="truncate text-xs text-on-surface-variant">{resident?.student_id ?? "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">{dates.leftLabel}</p>
              <p className="text-on-surface">{dates.leftValue}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">{dates.rightLabel}</p>
              <p className="text-on-surface">{dates.rightValue}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-on-surface-variant uppercase">Line items</p>
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-surface-container-low text-xs text-on-surface-variant uppercase">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="w-24 px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-outline-variant">
                      <td className="px-3 py-2 wrap-break-word text-on-surface">{item.description}</td>
                      <td className="px-3 py-2 text-right text-on-surface">{formatCurrency(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(() => {
            const hasDiscount = Number(invoice.discount) > 0;
            const itemCount = (invoice.items ?? []).length;
            // A single item with no discount already shows its total in the
            // line-items table above, so repeating it here is redundant.
            const showTotalRow = hasDiscount || itemCount >= 2;
            const showBalanceDue = invoice.status === "partially_paid";
            if (!showTotalRow && !showBalanceDue) return null;
            return (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
                {hasDiscount && (
                  <>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Subtotal</span>
                      <span>{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Discount</span>
                      <span>-{formatCurrency(invoice.discount)}</span>
                    </div>
                  </>
                )}
                {showTotalRow && (
                  <div
                    className={cn(
                      "flex justify-between font-semibold text-on-surface",
                      hasDiscount && "mt-1 border-t border-outline-variant pt-1",
                    )}
                  >
                    <span>Total</span>
                    <span>{formatCurrency(invoice.total_amount)}</span>
                  </div>
                )}
                {showBalanceDue && (
                  <div className={cn("flex justify-between text-amber-700", showTotalRow && "mt-1")}>
                    <span>Balance due</span>
                    <span>{formatCurrency(invoice.balance)}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {invoice.status !== "draft" && (
            <div>
              <p className="mb-2 text-xs font-semibold text-on-surface-variant uppercase">Payment history</p>
              {paymentsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No payments recorded yet.</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-outline-variant">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-surface-container-low text-xs text-on-surface-variant uppercase">
                        <tr>
                          <th className="w-24 px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Method</th>
                          <th className="w-24 px-3 py-2 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-t border-outline-variant">
                            <td className="px-3 py-2 text-on-surface-variant">{formatDate(payment.payment_date)}</td>
                            <td className="px-3 py-2 wrap-break-word text-on-surface-variant">
                              {payment.payment_method ? METHOD_LABEL[payment.payment_method] ?? payment.payment_method : "—"}
                              {payment.transaction_reference ? ` · ${payment.transaction_reference}` : ""}
                            </td>
                            <td className="px-3 py-2 text-right text-on-surface">{formatCurrency(payment.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-on-surface-variant">
                    <span>Total paid</span>
                    <span className="font-semibold text-on-surface">{formatCurrency(invoice.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Remaining balance</span>
                    <span className="font-semibold text-on-surface">{formatCurrency(invoice.balance)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {invoice.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Notes</p>
              <p className="text-on-surface-variant">{invoice.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
