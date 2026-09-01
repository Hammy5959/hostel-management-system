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
import {
  ApiError,
  createResidentCharge,
  getFeeStructure,
  updateResidentCharge,
} from "@/lib/api";
import { fetchBillingEligibleResidentOptions, fetchFeeStructureOptions } from "@/lib/hostel-options";
import { formatCurrency, normalizeAmountInput, todayLocalDate } from "@/lib/utils";
import type { ResidentCharge, ResidentChargeStatus } from "@/lib/types";

// partially_paid is deliberately absent: charges now follow an invoice-level
// payment model — a charge is either invoiced or paid (via hms_record_payment
// flipping it once its invoice is fully paid), never partially paid itself.
// Used by the Resident Charges page's status filter, which can filter by any
// status a charge might be in.
export const RESIDENT_CHARGE_STATUS_OPTIONS: { value: ResidentChargeStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
  { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" },
  { value: "overdue", label: "Overdue" },
];

const CURRENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  invoiced: "Invoiced",
  paid: "Paid",
  partially_paid: "Partially Paid",
  waived: "Waived",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

// pending/invoiced/paid/overdue are set automatically by the billing/payment
// flow (charge created -> pending, folded into an invoice -> invoiced, that
// invoice fully paid -> paid); admins must never override those from the edit
// modal, so only waived/cancelled are offered there.
const RESIDENT_CHARGE_MANUAL_STATUS_OPTIONS: { value: "waived" | "cancelled"; label: string }[] = [
  { value: "waived", label: "Waived" },
  { value: "cancelled", label: "Cancelled" },
];

/** Shared create/edit resident charge form — "Add Charge" and every card's
 * Edit button both open this same dialog (mirrors FeeStructureFormDialog).
 * Create lets the admin pick who/what/how much, including the amount; edit
 * never touches amount (resident/amount/charge type are immutable once a
 * charge exists) and only lets the admin change description, due date, and —
 * as a manual override — flip the charge to waived/cancelled. Every other
 * status transition happens automatically via the billing/payment flow. */
export function ResidentChargeFormDialog({
  open,
  onOpenChange,
  charge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: ResidentCharge | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!charge;

  const [resident, setResident] = useState<ComboOption | null>(null);
  const [feeStructure, setFeeStructure] = useState<ComboOption | null>(null);
  const [chargeType, setChargeType] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [chargeDate, setChargeDate] = useState(todayLocalDate);
  const [dueDate, setDueDate] = useState("");
  // Defaults to the charge's actual current status (shown as a disabled item
  // in the dropdown when it's system-managed) — only waived/cancelled are
  // ever clickable, so this only ever changes via an explicit manual choice.
  const [status, setStatus] = useState<ResidentChargeStatus>("pending");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset/prefill every time the dialog is (re)opened — mirrors
  // AllocateBedDialog's render-time reset pattern.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setResident(null);
    setFeeStructure(null);
    setChargeType("");
    setAmount("");
    setChargeDate(todayLocalDate());
    setDueDate(charge?.due_date ?? "");
    setDescription(charge?.description ?? "");
    setStatus((charge?.status as ResidentChargeStatus) ?? "pending");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function onFeeStructureChange(next: ComboOption | null) {
    setFeeStructure(next);
    if (next) {
      try {
        const fs = await getFeeStructure(next.value);
        setAmount(normalizeAmountInput(fs.amount));
      } catch {
        // Leave the amount as-is; the admin can still type it manually.
      }
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (isEdit && charge) {
        setFormError(null);
        setSubmitting(true);
        await updateResidentCharge(charge.id, {
          description: description || null,
          due_date: dueDate || null,
          // Only a pending charge's status is editable here (Waived/
          // Cancelled) — an invoiced charge's status is locked to the
          // invoice, so it's never included in the update payload.
          status: charge.status === "pending" ? status : undefined,
        });
        toast.success("Charge updated.");
      } else {
        if (!resident) {
          setFormError("Resident is required.");
          return;
        }
        if (!chargeType.trim()) {
          setFormError("Charge type is required.");
          return;
        }
        if (amount.trim() === "" || Number(amount) < 0) {
          setFormError("Enter a valid amount.");
          return;
        }
        setFormError(null);
        setSubmitting(true);
        await createResidentCharge({
          resident_id: resident.value,
          fee_structure_id: feeStructure?.value ?? null,
          charge_type: chargeType.trim(),
          description: description || null,
          amount,
          charge_date: chargeDate,
          due_date: dueDate || null,
        });
        toast.success("Charge created.");
      }
      queryClient.invalidateQueries({ queryKey: ["resident-charges"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "resident_charges.update" : "resident_charges.create");
        }
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
          <DialogTitle>{isEdit ? "Edit charge" : "Add charge"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this charge's description or due date, or manually waive/cancel it."
              : "Bill a resident for a one-time fee or charge."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            <FieldGroup>
              {isEdit && charge ? (
                <>
                  <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
                    <p className="font-semibold text-on-surface">
                      {[charge.resident?.first_name, charge.resident?.last_name]
                        .filter(Boolean)
                        .join(" ") || "Unknown resident"}
                    </p>
                    <p className="text-on-surface-variant">
                      {charge.charge_type} · {formatCurrency(charge.amount)}
                    </p>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="charge-status">Status</FieldLabel>
                    {charge.status === "pending" ? (
                      <>
                        <Select
                          value={status}
                          onValueChange={(value) => {
                            if (value === "waived" || value === "cancelled") setStatus(value);
                          }}
                        >
                          <SelectTrigger id="charge-status" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending" disabled>
                              Pending
                            </SelectItem>
                            {RESIDENT_CHARGE_MANUAL_STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1.5 text-xs text-on-surface-variant">
                          Leave as Pending, or manually Waive or Cancel this charge.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface">
                          {CURRENT_STATUS_LABEL[charge.status] ?? charge.status}
                        </p>
                        <p className="mt-1.5 text-xs text-on-surface-variant">
                          {charge.status === "invoiced"
                            ? "This charge is on an invoice — its status is locked here until that invoice is paid or cancelled."
                            : "This status is managed automatically and can't be changed here."}
                        </p>
                      </>
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <Field data-invalid={!!formError && !resident}>
                    <FieldLabel htmlFor="charge-resident">
                      Resident <span className="text-destructive">*</span>
                    </FieldLabel>
                    <EntityCombobox
                      id="charge-resident"
                      value={resident}
                      onChange={(next) => {
                        setResident(next);
                        if (next) setFormError(null);
                      }}
                      fetchOptions={fetchBillingEligibleResidentOptions}
                      placeholder="Search residents…"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="charge-fee-structure">Fee structure (optional)</FieldLabel>
                    <EntityCombobox
                      id="charge-fee-structure"
                      value={feeStructure}
                      onChange={onFeeStructureChange}
                      fetchOptions={fetchFeeStructureOptions}
                      placeholder="Link a fee structure to auto-fill the amount…"
                    />
                  </Field>

                  <Field data-invalid={!!formError && !chargeType.trim()}>
                    <FieldLabel htmlFor="charge-type">
                      Charge type <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="charge-type"
                      placeholder="e.g. Monthly Rent"
                      value={chargeType}
                      onChange={(e) => setChargeType(e.target.value)}
                    />
                  </Field>

                  <Field data-invalid={!!formError && amount.trim() === ""}>
                    <FieldLabel htmlFor="charge-amount">
                      Amount <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="charge-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="charge-date">Charge date</FieldLabel>
                    <Input
                      id="charge-date"
                      type="date"
                      value={chargeDate}
                      onChange={(e) => setChargeDate(e.target.value)}
                    />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor="charge-due-date">Due date (optional)</FieldLabel>
                <Input
                  id="charge-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>

              <Field className="mb-2">
                <FieldLabel htmlFor="charge-description">Description</FieldLabel>
                <Textarea
                  id="charge-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <FieldError errors={[formError ? { message: formError } : undefined]} />
            </FieldGroup>
          </div>

          <DialogFooter className="mt-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create charge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
