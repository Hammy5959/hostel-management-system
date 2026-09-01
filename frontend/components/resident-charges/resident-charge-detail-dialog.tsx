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

import { cn, formatCurrency } from "@/lib/utils";
import { getPayments } from "@/lib/api";
import type { ResidentCharge, ResidentChargeStatus } from "@/lib/types";

const STATUS_LABEL: Record<ResidentChargeStatus, string> = {
  pending: "Pending",
  invoiced: "Invoiced",
  paid: "Paid",
  partially_paid: "Partially Paid",
  waived: "Waived",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

// Mirrors resident-charges-view.tsx's STATUS_TONE so the badge here reads the
// same as the card it was opened from.
const STATUS_TONE: Record<ResidentChargeStatus, string> = {
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  invoiced: "border-blue-200 bg-blue-100 text-blue-800",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
  partially_paid: "border-yellow-200 bg-yellow-100 text-yellow-800",
  waived: "border-gray-200 bg-gray-100 text-gray-600",
  cancelled: "border-gray-200 bg-gray-100 text-gray-600",
  overdue: "border-error/30 bg-error-container text-on-error-container",
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

/** Read-only resident charge detail — the "View" button on a paid/waived/
 * cancelled charge card (those are finalized; editing them makes no sense).
 * No extra fetch: the list already embeds `resident`/`invoice` per charge
 * (app.resident_charges.service._SELECT), mirrors InvoiceDetailDialog /
 * PaymentDetailDialog. */
export function ResidentChargeDetailDialog({
  open,
  onOpenChange,
  charge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: ResidentCharge | null;
}) {
  // Hooks must run unconditionally, so this sits above the `!charge` guard
  // below. A charge is only ever marked paid when its linked invoice becomes
  // fully paid (invoice-level model, no per-charge amount_paid) — so its
  // "paid date" is the most recent payment against that invoice, fetched via
  // the same GET /payments?invoice_id endpoint the invoice dialog uses.
  const invoiceId = charge?.invoice?.id;
  const paymentsQuery = useQuery({
    queryKey: ["payments", { invoice_id: invoiceId }],
    queryFn: () => getPayments({ invoice_id: invoiceId!, per_page: 100 }),
    enabled: open && charge?.status === "paid" && !!invoiceId,
  });

  if (!charge) return null;

  const status = charge.status as ResidentChargeStatus;
  const paidDate =
    status === "paid"
      ? (paymentsQuery.data?.items ?? []).reduce<string | null>(
          (latest, payment) => (!latest || payment.payment_date > latest ? payment.payment_date : latest),
          null,
        )
      : null;
  const resident = charge.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{charge.charge_type}</DialogTitle>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                STATUS_TONE[status],
              )}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
          <DialogDescription>Charge details.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border border-outline-variant">
              <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={residentName} />
              <AvatarFallback>{resident ? initials(resident.first_name, resident.last_name) : "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold text-on-surface">{residentName}</p>
              <p className="truncate text-xs text-on-surface-variant">
                {charge.room_number ? `Room ${charge.room_number}` : resident?.student_id ?? "—"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div className="flex justify-between text-on-surface-variant">
              <span>Amount</span>
              <span className="font-semibold text-on-surface">{formatCurrency(charge.amount)}</span>
            </div>
            <div className="mt-1 flex justify-between text-on-surface-variant">
              <span>Linked invoice</span>
              <span className="font-semibold text-on-surface">{charge.invoice?.invoice_number ?? "Not invoiced"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Charge date</p>
              <p className="text-on-surface">{formatDate(charge.charge_date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Due date</p>
              <p className="text-on-surface">{formatDate(charge.due_date)}</p>
            </div>
            {status === "paid" && (
              <div>
                <p className="text-xs font-semibold text-on-surface-variant uppercase">Paid date</p>
                <p className="text-on-surface">
                  {paymentsQuery.isLoading ? "Loading…" : formatDate(paidDate)}
                </p>
              </div>
            )}
          </div>

          {charge.description && (
            <div>
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Description</p>
              <p className="text-on-surface-variant">{charge.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
