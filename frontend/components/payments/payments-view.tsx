"use client";

import { useState, type SubmitEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarDays,
  Clock,
  CreditCard,
  Globe,
  Hash,
  Landmark,
  Plus,
  Receipt,
  Search,
  ShieldOff,
  Wallet,
} from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Breadcrumbs } from "@/components/hostel/breadcrumbs";
import { EmptyState } from "@/components/hostel/empty-state";
import { ErrorState } from "@/components/hostel/error-state";
import { Pagination } from "@/components/hostel/pagination";
import { usePermissions } from "@/lib/permissions";
import { ApiError, getPayments } from "@/lib/api";
import type { Payment } from "@/lib/types";
import { PaymentFormDialog } from "@/components/payments/payment-form-dialog";
import { PaymentDetailDialog } from "@/components/payments/payment-detail-dialog";

const PAYMENT_METHOD_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
];

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

// Mirrors invoices-view.tsx's per-status badge tones, one per payment method
// instead — same token palette as the Stitch mock.
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
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  icon: Icon,
  chipClassName,
  valueClassName,
  label,
  value,
}: {
  icon: typeof Receipt;
  chipClassName: string;
  valueClassName?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            {label}
          </p>
          <h3 className={cn("text-2xl font-semibold text-on-surface", valueClassName)}>{value}</h3>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", chipClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
    </div>
  );
}

function PaymentCard({ payment, onView }: { payment: Payment; onView: () => void }) {
  const resident = payment.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const method = payment.payment_method;
  const MethodIcon = method ? METHOD_ICON[method] : undefined;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-start gap-4 sm:items-center">
        <Avatar className="size-12 shrink-0 border border-outline-variant">
          <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={residentName} />
          <AvatarFallback className="font-bold">
            {resident ? initials(resident.first_name, resident.last_name) : "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-on-surface">{residentName}</span>
            <span className="rounded-md border border-outline-variant/30 bg-surface-variant px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
              {payment.payment_reference}
            </span>
            {method && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  METHOD_BADGE_TONE[method],
                )}
              >
                {MethodIcon && <MethodIcon aria-hidden className="size-3.5" />}
                {METHOD_LABEL[method] ?? method}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <CalendarDays aria-hidden className="size-4" />
              {formatDate(payment.payment_date)}
            </span>
            {payment.invoice && (
              <span className="flex items-center gap-1">
                <Receipt aria-hidden className="size-4" />
                {payment.invoice.invoice_number}
              </span>
            )}
            {payment.transaction_reference && (
              <span className="flex items-center gap-1">
                <Hash aria-hidden className="size-4" />
                {payment.transaction_reference}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-6 border-t border-outline-variant/30 pt-3 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
        <div className="flex flex-col sm:items-end">
          <span className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Amount</span>
          <span className="text-lg font-bold text-on-surface">{formatCurrency(payment.amount)}</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onView}>
          View
        </Button>
      </div>
    </div>
  );
}

export function PaymentsView() {
  const { has } = usePermissions();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Payment | null>(null);

  const canCreate = has("payments.create");

  const query = useQuery({
    queryKey: ["payments", { page, perPage, search, paymentMethod, dateFrom, dateTo }],
    queryFn: () =>
      getPayments({
        page,
        per_page: perPage,
        search: search || undefined,
        payment_method: paymentMethod || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Finance & Fees" }, { label: "Payments" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Payments
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track and manage all resident payment transactions and history.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Record Payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {query.isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : (
          <>
            <StatCard
              icon={Wallet}
              chipClassName="bg-primary/10 text-primary"
              label="Total Collected"
              value={formatCurrency(summary.total_collected)}
            />
            <StatCard
              icon={CalendarDays}
              chipClassName="bg-surface-container-high text-on-surface-variant"
              label="This Month"
              value={formatCurrency(summary.this_month)}
            />
            <StatCard
              icon={Receipt}
              chipClassName="bg-surface-container-high text-on-surface-variant"
              label="Total Payments"
              value={summary.total_payments.toLocaleString()}
            />
            <StatCard
              icon={Clock}
              chipClassName="bg-error-container text-error"
              valueClassName="text-error"
              label="Outstanding"
              value={formatCurrency(summary.outstanding)}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center">
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full">
            <Search
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                if (value.trim() === "") {
                  setPage(1);
                  setSearch("");
                }
              }}
              placeholder="Search by resident, payment ref or invoice…"
              aria-label="Search payments"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={paymentMethod || "all"}
            onValueChange={(value) => {
              setPaymentMethod(!value || value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-48">
              <SelectValue placeholder="Payment Method (All)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Payment Method (All)</SelectItem>
              {PAYMENT_METHOD_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="From date"
              className="h-9 w-[132px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
            <span className="text-on-surface-variant">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="To date"
              className="h-9 w-[132px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Payments"
          description="Ask an administrator to grant you the payments.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments found"
          description={
            search || paymentMethod || dateFrom || dateTo
              ? "No payments match your filters."
              : "Recorded payments will show up here."
          }
          action={canCreate ? { label: "Record Payment", onClick: () => setDialogOpen(true) } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="space-y-4">
              {items.map((payment) => (
                <PaymentCard key={payment.id} payment={payment} onView={() => setViewing(payment)} />
              ))}
            </div>

            <Pagination
              page={query.data.page}
              perPage={query.data.per_page}
              total={query.data.total}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next);
                setPage(1);
              }}
            />
          </>
        )
      )}

      <PaymentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <PaymentDetailDialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} payment={viewing} />
    </div>
  );
}
