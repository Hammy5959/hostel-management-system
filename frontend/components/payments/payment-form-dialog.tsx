"use client";

import { useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox";

import { markPermissionDenied } from "@/lib/permissions";
import { ApiError, getInvoice, recordPayment } from "@/lib/api";
import { fetchPayableInvoiceOptions, fetchPaymentEligibleResidentOptions } from "@/lib/hostel-options";
import { formatCurrency, normalizeAmountInput } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
];

/** Records a payment against an invoice. Opened blank from the Payments page
 * ("Record Payment") or pre-filled from the Invoices page's Record Payment
 * button on an issued/partially-paid card — in the latter case the resident
 * and invoice are fixed (shown read-only) since the button already picked
 * both. Mirrors InvoiceFormDialog's reset-on-open pattern. */
export function PaymentFormDialog({
  open,
  onOpenChange,
  presetInvoice = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetInvoice?: Invoice | null;
}) {
  const queryClient = useQueryClient();
  const isPreset = !!presetInvoice;

  const [resident, setResident] = useState<ComboOption | null>(null);
  const [invoice, setInvoice] = useState<ComboOption | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [transactionReference, setTransactionReference] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset/prefill every time the dialog is (re)opened — mirrors
  // InvoiceFormDialog's render-time reset pattern.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    if (presetInvoice) {
      const residentRef = presetInvoice.resident;
      setResident(
        residentRef
          ? {
              value: residentRef.id,
              label: [residentRef.first_name, residentRef.last_name].filter(Boolean).join(" "),
              sublabel: residentRef.student_id ?? undefined,
            }
          : null,
      );
      setInvoice({
        value: presetInvoice.id,
        label: presetInvoice.invoice_number,
        sublabel: `Balance: ${formatCurrency(presetInvoice.balance)}`,
      });
      setAmount(normalizeAmountInput(presetInvoice.balance));
    } else {
      setResident(null);
      setInvoice(null);
      setAmount("");
    }
    setPaymentMethod("");
    setTransactionReference("");
    setPaymentReference("");
    setNotes("");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function onResidentChange(next: ComboOption | null) {
    setResident(next);
    setInvoice(null);
    setAmount("");
    if (next) setFormError(null);
  }

  async function onInvoiceChange(next: ComboOption | null) {
    setInvoice(next);
    if (!next) {
      setAmount("");
      return;
    }
    setFormError(null);
    try {
      const inv = await getInvoice(next.value);
      setAmount(normalizeAmountInput(inv.balance));
    } catch {
      // Leave amount blank; the admin can still type it manually.
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!resident) {
      setFormError("Resident is required.");
      return;
    }
    if (!invoice) {
      setFormError("Invoice is required.");
      return;
    }
    if (amount.trim() === "" || Number(amount) <= 0) {
      setFormError("Enter a valid payment amount greater than 0.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await recordPayment({
        resident_id: resident.value,
        invoice_id: invoice.value,
        payment_reference: paymentReference || null,
        amount,
        payment_method: paymentMethod || null,
        transaction_reference: transactionReference || null,
        notes: notes || null,
      });
      toast.success("Payment recorded.");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // A payment that fully pays an invoice flips its linked resident
      // charges to paid (hms_record_payment) — refresh that page too.
      queryClient.invalidateQueries({ queryKey: ["resident-charges"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("payments.create");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {isPreset
              ? "Record a payment against this invoice."
              : "Record a payment a resident has made against one of their invoices."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="-mx-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4">
            <FieldGroup>
              {isPreset && presetInvoice ? (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
                  <p className="font-semibold text-on-surface">{presetInvoice.invoice_number}</p>
                  <p className="text-on-surface-variant">
                    {resident?.label ?? "Unknown resident"} · Balance due{" "}
                    {formatCurrency(presetInvoice.balance)}
                  </p>
                </div>
              ) : (
                <>
                  <Field data-invalid={!!formError && !resident}>
                    <FieldLabel htmlFor="payment-resident">
                      Resident <span className="text-destructive">*</span>
                    </FieldLabel>
                    <EntityCombobox
                      id="payment-resident"
                      value={resident}
                      onChange={onResidentChange}
                      fetchOptions={fetchPaymentEligibleResidentOptions}
                      placeholder="Search residents…"
                    />
                  </Field>

                  <Field data-invalid={!!formError && !invoice}>
                    <FieldLabel htmlFor="payment-invoice">
                      Invoice <span className="text-destructive">*</span>
                    </FieldLabel>
                    <EntityCombobox
                      id="payment-invoice"
                      value={invoice}
                      onChange={onInvoiceChange}
                      fetchOptions={fetchPayableInvoiceOptions(resident?.value)}
                      placeholder={resident ? "Search this resident's invoices…" : "Select a resident first"}
                      disabled={!resident}
                    />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor="payment-amount">
                  Amount <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="payment-amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-method">Payment method</FieldLabel>
                <Select
                  value={paymentMethod || "none"}
                  onValueChange={(v) => setPaymentMethod(!v || v === "none" ? "" : v)}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Select a method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-transaction-reference">Transaction reference (optional)</FieldLabel>
                <Input
                  id="payment-transaction-reference"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-reference">Payment reference (optional)</FieldLabel>
                <Input
                  id="payment-reference"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Auto-generated if left blank"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-notes">Notes</FieldLabel>
                <Textarea id="payment-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>

              <FieldError errors={[formError ? { message: formError } : undefined]} />
            </FieldGroup>
          </div>

          <DialogFooter className="mt-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
