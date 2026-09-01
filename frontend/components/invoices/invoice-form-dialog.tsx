"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox";

import { markPermissionDenied } from "@/lib/permissions";
import {
  ApiError,
  createInvoice,
  getFeeStructure,
  getResidentCharges,
  updateInvoice,
} from "@/lib/api";
import { fetchBillingEligibleResidentOptions, fetchFeeStructureOptions } from "@/lib/hostel-options";
import { cn, formatCurrency, normalizeAmountInput, todayLocalDate } from "@/lib/utils";
import type { Invoice, ResidentCharge } from "@/lib/types";

interface LineItemRow {
  key: string;
  feeStructure: ComboOption | null;
  description: string;
  quantity: string;
  unitAmount: string;
}

function emptyRow(key: string): LineItemRow {
  return { key, feeStructure: null, description: "", quantity: "1", unitAmount: "" };
}

function lineTotal(row: LineItemRow): number {
  const qty = Number(row.quantity);
  const unit = Number(row.unitAmount);
  return (Number.isNaN(qty) ? 0 : qty) * (Number.isNaN(unit) ? 0 : unit);
}

/** A fee structure already picked in another row shouldn't be offered again —
 * the current row's own selection stays visible so it doesn't disappear from
 * its own dropdown. Manual (no fee structure) line items are unaffected. */
function fetchFeeStructureOptionsExcluding(rows: LineItemRow[], currentKey: string) {
  const excluded = new Set(
    rows.filter((r) => r.key !== currentKey && r.feeStructure).map((r) => r.feeStructure!.value),
  );
  return async (search: string): Promise<ComboOption[]> => {
    const options = await fetchFeeStructureOptions(search);
    return options.filter((option) => !excluded.has(option.value));
  };
}

/** Shared create/edit invoice form — "Create Invoice" and every draft card's
 * Edit button both open this same dialog (mirrors ResidentChargeFormDialog).
 * Create lets the admin build the full line-item list; edit only touches the
 * fields app.invoices.schemas.InvoiceUpdate actually accepts (due date,
 * discount, notes) — resident/items/issue date are immutable once an invoice
 * exists, and only a draft invoice can be edited at all (enforced by only
 * showing the Edit button on draft cards). */
export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!invoice;
  const rowCounter = useRef(0);

  const [resident, setResident] = useState<ComboOption | null>(null);
  const [issueDate, setIssueDate] = useState(todayLocalDate);
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemRow[]>([emptyRow("0")]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingCharges, setPendingCharges] = useState<ResidentCharge[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState<string | null>(null);
  const chargesRequestId = useRef(0);

  // Reset/prefill every time the dialog is (re)opened — mirrors
  // ResidentChargeFormDialog's render-time reset pattern.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setResident(null);
    setIssueDate(todayLocalDate());
    setDueDate(invoice?.due_date ?? "");
    setDiscount(invoice ? String(invoice.discount) : "0");
    setNotes(invoice?.notes ?? "");
    setItems([emptyRow("0")]);
    setFormError(null);
    setPendingCharges([]);
    setSelectedChargeIds(new Set());
    setChargesLoading(false);
    setChargesError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // Refs can't be mutated during render (unlike the setState calls above,
  // which React explicitly supports for this "reset on prop change" pattern)
  // — bump them a tick later instead. Both are purely internal bookkeeping
  // (a row-key counter and a stale-request guard), so a one-render delay is
  // inert; nothing rendered depends on their value.
  useEffect(() => {
    if (open) {
      rowCounter.current = 0;
      chargesRequestId.current += 1;
    }
  }, [open]);

  async function onResidentChange(next: ComboOption | null) {
    setResident(next);
    if (next) setFormError(null);
    setSelectedChargeIds(new Set());
    setChargesError(null);
    const requestId = ++chargesRequestId.current;
    if (!next) {
      setPendingCharges([]);
      setChargesLoading(false);
      return;
    }
    setPendingCharges([]);
    setChargesLoading(true);
    try {
      const result = await getResidentCharges({ resident_id: next.value, status: "pending", per_page: 100 });
      if (chargesRequestId.current !== requestId) return;
      setPendingCharges(result.items);
      setSelectedChargeIds(new Set(result.items.map((c) => c.id)));
    } catch {
      if (chargesRequestId.current !== requestId) return;
      setChargesError("Unable to load pending charges.");
    } finally {
      if (chargesRequestId.current === requestId) setChargesLoading(false);
    }
  }

  function toggleCharge(id: string) {
    setSelectedChargeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function addRow() {
    rowCounter.current += 1;
    setItems((prev) => [...prev, emptyRow(String(rowCounter.current))]);
  }

  function removeRow(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function onRowFeeStructureChange(key: string, next: ComboOption | null) {
    updateRow(key, { feeStructure: next });
    if (next) {
      try {
        const fs = await getFeeStructure(next.value);
        updateRow(key, { description: fs.name, unitAmount: normalizeAmountInput(fs.amount) });
      } catch {
        // Leave description/amount as-is; the admin can still type them manually.
      }
    }
  }

  const chargesSubtotal = pendingCharges
    .filter((c) => selectedChargeIds.has(c.id))
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const subtotal =
    isEdit && invoice ? Number(invoice.subtotal) : chargesSubtotal + items.reduce((sum, r) => sum + lineTotal(r), 0);
  const discountNum = Number(discount) || 0;
  const total = subtotal - discountNum;

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (isEdit && invoice) {
        setFormError(null);
        setSubmitting(true);
        await updateInvoice(invoice.id, {
          due_date: dueDate || null,
          notes: notes || null,
          discount,
        });
        toast.success("Invoice updated.");
      } else {
        if (!resident) {
          setFormError("Resident is required.");
          return;
        }
        const filledItems = items.filter(
          (row) => row.description.trim() !== "" || row.unitAmount.trim() !== "" || row.feeStructure,
        );
        for (const row of filledItems) {
          if (!row.description.trim()) {
            setFormError("Every line item needs a description.");
            return;
          }
          if (row.quantity.trim() === "" || Number(row.quantity) <= 0) {
            setFormError("Every line item needs a quantity greater than 0.");
            return;
          }
          if (row.unitAmount.trim() === "" || Number(row.unitAmount) < 0) {
            setFormError("Every line item needs a valid unit amount.");
            return;
          }
        }
        if (filledItems.length === 0 && selectedChargeIds.size === 0) {
          setFormError("Add at least one line item or select a pending charge.");
          return;
        }
        setFormError(null);
        setSubmitting(true);
        await createInvoice({
          resident_id: resident.value,
          issue_date: issueDate,
          due_date: dueDate || null,
          discount,
          notes: notes || null,
          items: filledItems.map((row) => ({
            fee_structure_id: row.feeStructure?.value ?? null,
            description: row.description.trim(),
            quantity: row.quantity,
            unit_amount: row.unitAmount,
          })),
          resident_charge_ids: Array.from(selectedChargeIds),
        });
        toast.success("Invoice created.");
        queryClient.invalidateQueries({ queryKey: ["resident-charges"] });
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "invoices.update" : "invoices.create");
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
          <DialogTitle>{isEdit ? "Edit invoice" : "Create invoice"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this draft invoice's due date, discount, or notes."
              : "Bill a resident with one or more line items."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="-mx-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4">
            <FieldGroup>
              {isEdit && invoice ? (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
                  <p className="font-semibold text-on-surface">{invoice.invoice_number}</p>
                  <p className="text-on-surface-variant">
                    {[invoice.resident?.first_name, invoice.resident?.last_name].filter(Boolean).join(" ") ||
                      "Unknown resident"}{" "}
                    · Subtotal {formatCurrency(invoice.subtotal)}
                  </p>
                </div>
              ) : (
                <>
                  <Field data-invalid={!!formError && !resident}>
                    <FieldLabel htmlFor="invoice-resident">
                      Resident <span className="text-destructive">*</span>
                    </FieldLabel>
                    <EntityCombobox
                      id="invoice-resident"
                      value={resident}
                      onChange={onResidentChange}
                      fetchOptions={fetchBillingEligibleResidentOptions}
                      placeholder="Search residents…"
                    />
                  </Field>

                  {resident && (
                    <Field>
                      <FieldLabel>Pending charges</FieldLabel>
                      {chargesLoading ? (
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-14 w-full rounded-lg" />
                          <Skeleton className="h-14 w-full rounded-lg" />
                        </div>
                      ) : chargesError ? (
                        <p className="text-sm text-on-surface-variant">{chargesError}</p>
                      ) : pendingCharges.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">No pending charges for this resident.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {pendingCharges.map((charge) => (
                            <label
                              key={charge.id}
                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedChargeIds.has(charge.id)}
                                onChange={() => toggleCharge(charge.id)}
                                className="mt-0.5 size-4 shrink-0 rounded border-outline-variant accent-primary"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-on-surface">{charge.charge_type}</div>
                                {charge.description && (
                                  <div className="truncate text-xs text-on-surface-variant">
                                    {charge.description}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 font-semibold text-on-surface">
                                {formatCurrency(charge.amount)}
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </Field>
                  )}

                  <Field>
                    <FieldLabel htmlFor="invoice-issue-date">Issue date</FieldLabel>
                    <Input
                      id="invoice-issue-date"
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor="invoice-due-date">Due date (optional)</FieldLabel>
                <Input
                  id="invoice-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="invoice-discount">Discount</FieldLabel>
                <Input
                  id="invoice-discount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>

              {!isEdit && (
                <Field>
                  <FieldLabel>Additional line items</FieldLabel>
                  <div className="flex flex-col gap-3">
                    {items.map((row, i) => (
                      <div
                        key={row.key}
                        className="rounded-lg border border-outline-variant bg-surface-container-low p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-on-surface-variant uppercase">
                            Item {i + 1}
                          </span>
                          <button
                            type="button"
                            aria-label="Remove line item"
                            onClick={() => removeRow(row.key)}
                            disabled={items.length === 1}
                            className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        </div>

                        <div className="mb-2">
                          <EntityCombobox
                            value={row.feeStructure}
                            onChange={(next) => onRowFeeStructureChange(row.key, next)}
                            fetchOptions={fetchFeeStructureOptionsExcluding(items, row.key)}
                            placeholder="Link a fee structure to auto-fill…"
                          />
                        </div>

                        <div className="mb-2">
                          <Input
                            placeholder="Description"
                            value={row.description}
                            onChange={(e) => updateRow(row.key, { description: e.target.value })}
                            aria-label={`Item ${i + 1} description`}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            placeholder="Quantity"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                            aria-label={`Item ${i + 1} quantity`}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Unit amount"
                            value={row.unitAmount}
                            onChange={(e) => updateRow(row.key, { unitAmount: e.target.value })}
                            aria-label={`Item ${i + 1} unit amount`}
                          />
                        </div>

                        <div className="mt-2 text-right text-xs text-on-surface-variant">
                          Line total: {formatCurrency(lineTotal(row))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRow}
                    className="mt-1 h-9 w-fit gap-1.5 rounded-lg text-sm"
                  >
                    <Plus aria-hidden className="size-4" />
                    Add line item
                  </Button>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="invoice-notes">Notes</FieldLabel>
                <Textarea id="invoice-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>

              <div className="mb-2 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal (preview)</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>Discount</span>
                  <span>-{formatCurrency(discountNum)}</span>
                </div>
                <div
                  className={cn(
                    "mt-1 flex justify-between border-t border-outline-variant pt-1 font-semibold text-on-surface",
                    total < 0 && "text-destructive",
                  )}
                >
                  <span>Total (preview)</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <FieldError errors={[formError ? { message: formError } : undefined]} />
            </FieldGroup>
          </div>

          <DialogFooter className="mt-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
