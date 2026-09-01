"use client";

import { Banknote, CreditCard, Globe, Landmark } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { cn, formatCurrency } from "@/lib/utils";
import type { Payment } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  online: "Online",
};

const METHOD_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  bank_transfer: Landmark,
  card: CreditCard,
  online: Globe,
};

const METHOD_BADGE_TONE: Record<string, string> = {
  cash: "border-outline-variant/50 bg-inverse-on-surface text-secondary",
  bank_transfer: "border-outline-variant/50 bg-surface-container-highest text-on-secondary-fixed-variant",
  card: "border-outline-variant/50 bg-surface-container-high text-on-surface",
  online: "border-secondary-container/50 bg-secondary-container text-on-secondary-container",
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
  });
}

/** Read-only payment detail — the "View" button on every payment card. No
 * extra fetch: the list already embeds `resident`/`invoice`/`received_by_user`
 * per payment (app.payments.service._SELECT), mirrors InvoiceDetailDialog. */
export function PaymentDetailDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
}) {
  if (!payment) return null;

  const resident = payment.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const receivedBy = payment.received_by_user
    ? [payment.received_by_user.first_name, payment.received_by_user.last_name].filter(Boolean).join(" ")
    : "—";
  const method = payment.payment_method;
  const MethodIcon = method ? METHOD_ICON[method] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{payment.payment_reference}</DialogTitle>
            {method && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  METHOD_BADGE_TONE[method],
                )}
              >
                {MethodIcon && <MethodIcon aria-hidden className="size-3.5" />}
                {METHOD_LABEL[method] ?? method}
              </span>
            )}
          </div>
          <DialogDescription>Payment details.</DialogDescription>
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

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div className="flex justify-between text-on-surface-variant">
              <span>Invoice</span>
              <span className="font-semibold text-on-surface">{payment.invoice?.invoice_number ?? "—"}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-outline-variant pt-1 font-semibold text-on-surface">
              <span>Amount paid</span>
              <span>{formatCurrency(payment.amount)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Payment date</p>
              <p className="text-on-surface">{formatDate(payment.payment_date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Received by</p>
              <p className="text-on-surface">{receivedBy}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Transaction reference</p>
              <p className="text-on-surface">{payment.transaction_reference || "—"}</p>
            </div>
          </div>

          {payment.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Notes</p>
              <p className="text-on-surface-variant">{payment.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
