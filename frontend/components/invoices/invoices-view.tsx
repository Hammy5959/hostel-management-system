"use client";

import { useState, type SubmitEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileEdit,
  Plus,
  Receipt,
  Search,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

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
import { ConfirmDialog } from "@/components/hostel/confirm-dialog";
import { usePermissions, markPermissionDenied } from "@/lib/permissions";
import { ApiError, cancelInvoice, getInvoices, issueInvoice } from "@/lib/api";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog";
import { InvoiceDetailDialog } from "@/components/invoices/invoice-detail-dialog";
import { PaymentFormDialog } from "@/components/payments/payment-form-dialog";

const STATUS_FILTER_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const STATUS_BADGE_TONE: Record<InvoiceStatus, string> = {
  draft: "border-outline-variant bg-surface-variant text-on-surface-variant",
  issued: "border-blue-200 bg-blue-100 text-blue-800",
  partially_paid: "border-amber-200 bg-amber-100 text-amber-800",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
  overdue: "border-error/30 bg-error-container text-error",
  cancelled: "border-error/30 bg-error-container text-error",
};

const STATUS_STRIPE: Record<InvoiceStatus, string> = {
  draft: "bg-outline-variant",
  issued: "bg-blue-500",
  partially_paid: "bg-amber-500",
  paid: "bg-emerald-500",
  overdue: "bg-error",
  cancelled: "bg-error",
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
    timeZone: "UTC",
  });
}

function StatCard({
  icon: Icon,
  chipClassName,
  label,
  value,
}: {
  icon: typeof Receipt;
  chipClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            {label}
          </p>
          <h3 className="text-2xl font-semibold text-on-surface">{value.toLocaleString()}</h3>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", chipClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
    </div>
  );
}

/** The date row depends purely on status, mirroring the Stitch mock (Created/
 * Due for a draft, Issued/Due for issued/partially_paid/paid, Issued/Cancelled
 * for a cancelled invoice). */
function InvoiceDates({ invoice }: { invoice: Invoice }) {
  if (invoice.status === "draft") {
    return (
      <>
        <span>Created: {formatDate(invoice.created_at)}</span>
        <span>Due: {formatDate(invoice.due_date)}</span>
      </>
    );
  }
  if (invoice.status === "cancelled") {
    return (
      <>
        <span>Issued: {formatDate(invoice.issue_date)}</span>
        <span>Cancelled: {formatDate(invoice.updated_at)}</span>
      </>
    );
  }
  return (
    <>
      <span>Issued: {formatDate(invoice.issue_date)}</span>
      <span>Due: {formatDate(invoice.due_date)}</span>
    </>
  );
}

function InvoiceCard({
  invoice,
  canManage,
  canRecordPayment,
  onEdit,
  onView,
  onIssue,
  onCancel,
  onRecordPayment,
}: {
  invoice: Invoice;
  canManage: boolean;
  canRecordPayment: boolean;
  onEdit: () => void;
  onView: () => void;
  onIssue: () => void;
  onCancel: () => void;
  onRecordPayment: () => void;
}) {
  const status = invoice.status;
  const resident = invoice.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const muted = status === "cancelled";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition-shadow hover:shadow-md",
        muted && "opacity-75",
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", STATUS_STRIPE[status])} />
      <div className="mb-4 flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <span className={cn("text-base font-bold text-on-surface", status === "cancelled" && "line-through")}>
            {invoice.invoice_number}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Avatar className="size-6 border border-outline-variant">
              <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={residentName} />
              <AvatarFallback className="text-[10px]">
                {resident ? initials(resident.first_name, resident.last_name) : "?"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm text-on-surface-variant">{residentName}</span>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_BADGE_TONE[status])}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mb-4 pl-2">
        <span className={cn("text-2xl font-semibold text-on-surface", muted && "text-on-surface-variant")}>
          {formatCurrency(invoice.total_amount)}
        </span>
        {status === "partially_paid" && (
          <div className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Balance Due: {formatCurrency(invoice.balance)}
          </div>
        )}
      </div>

      <div className="mb-4 flex justify-between pl-2 text-sm text-on-surface-variant">
        <InvoiceDates invoice={invoice} />
      </div>

      <div className="mt-auto flex justify-end gap-2 border-t border-outline-variant pt-4 pl-2">
        {status === "draft" && canManage && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button type="button" size="sm" onClick={onIssue}>
              Issue
            </Button>
          </>
        )}
        {(status === "issued" || status === "partially_paid" || status === "overdue") && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onView}>
              View
            </Button>
            {canRecordPayment && (
              <Button type="button" size="sm" onClick={onRecordPayment}>
                Record Payment
              </Button>
            )}
          </>
        )}
        {(status === "paid" || status === "cancelled") && (
          <Button type="button" variant="outline" size="sm" onClick={onView}>
            View
          </Button>
        )}
      </div>
    </div>
  );
}

export function InvoicesView() {
  const { has } = usePermissions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [issuingInvoice, setIssuingInvoice] = useState<Invoice | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const canCreate = has("invoices.create");
  const canManage = has("invoices.update");
  const canRecordPayment = has("payments.create");

  const query = useQuery({
    queryKey: ["invoices", { page, perPage, search, status, dateFrom, dateTo }],
    queryFn: () =>
      getInvoices({
        page,
        per_page: perPage,
        search: search || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(invoice: Invoice) {
    setEditing(invoice);
    setDialogOpen(true);
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function confirmIssue() {
    if (!issuingInvoice) return;
    setIssuing(true);
    try {
      await issueInvoice(issuingInvoice.id);
      toast.success("Invoice issued.");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setIssuingInvoice(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("invoices.update");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setIssuing(false);
    }
  }

  async function confirmCancel() {
    if (!cancellingInvoice) return;
    setCancelling(true);
    try {
      await cancelInvoice(cancellingInvoice.id);
      toast.success("Invoice cancelled.");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // Cancelling an invoice reverts its linked resident charges to pending
      // (see app.invoices.service.cancel_invoice) — refresh that page too.
      queryClient.invalidateQueries({ queryKey: ["resident-charges"] });
      setCancellingInvoice(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("invoices.update");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setCancelling(false);
    }
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Finance & Fees" }, { label: "Invoices" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Invoices
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Manage and track all resident payments and billing records.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Create Invoice
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
              icon={Receipt}
              chipClassName="bg-primary/10 text-primary"
              label="Total Invoices"
              value={summary.total}
            />
            <StatCard
              icon={FileEdit}
              chipClassName="bg-surface-container-high text-on-surface-variant"
              label="Draft"
              value={summary.draft}
            />
            <StatCard
              icon={Clock}
              chipClassName="bg-error-container text-error"
              label="Issued / Unpaid"
              value={summary.issued_unpaid}
            />
            <StatCard
              icon={CheckCircle2}
              chipClassName="bg-emerald-100 text-emerald-700"
              label="Paid"
              value={summary.paid}
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
              placeholder="Search invoice number or resident…"
              aria-label="Search invoices"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(!value || value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-44">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_FILTER_OPTIONS.map((option) => (
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
          title="You don't have access to Invoices"
          description="Ask an administrator to grant you the invoices.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description={
            search || status || dateFrom || dateTo
              ? "No invoices match your filters."
              : "Create your first invoice to get started."
          }
          action={canCreate ? { label: "Create Invoice", onClick: openCreate } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  canManage={canManage}
                  canRecordPayment={canRecordPayment}
                  onEdit={() => openEdit(invoice)}
                  onView={() => setViewing(invoice)}
                  onIssue={() => setIssuingInvoice(invoice)}
                  onCancel={() => setCancellingInvoice(invoice)}
                  onRecordPayment={() => setPayingInvoice(invoice)}
                />
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

      <InvoiceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} invoice={editing} />
      <InvoiceDetailDialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} invoice={viewing} />
      <PaymentFormDialog
        open={!!payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
        presetInvoice={payingInvoice}
      />

      <ConfirmDialog
        open={!!issuingInvoice}
        onOpenChange={(open) => !open && setIssuingInvoice(null)}
        title="Issue this invoice?"
        description={`${issuingInvoice?.invoice_number ?? "This invoice"} will move from Draft to Issued and can no longer be edited.`}
        confirmLabel="Issue"
        loading={issuing}
        onConfirm={confirmIssue}
      />

      <ConfirmDialog
        open={!!cancellingInvoice}
        onOpenChange={(open) => !open && setCancellingInvoice(null)}
        title="Cancel this invoice?"
        description={`${cancellingInvoice?.invoice_number ?? "This invoice"} will be marked as cancelled. This cannot be undone.`}
        confirmLabel="Cancel invoice"
        destructive
        loading={cancelling}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
