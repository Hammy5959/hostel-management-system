import {
  getBeds,
  getBuildings,
  getFeeStructures,
  getFloors,
  getInvoices,
  getRooms,
  searchResidents,
} from "@/lib/api"
import type { ComboOption } from "@/components/hostel/entity-combobox"
import { formatCurrency } from "@/lib/utils"

/** Async option-fetchers for the cascading Building → Floor → Room → Bed
 * pickers, and the resident/admission pickers used by the Allocation
 * workflow. Every fetcher hits a real, already-scoped backend endpoint —
 * filtering happens server-side. */

export async function fetchBuildingOptions(search: string): Promise<ComboOption[]> {
  const res = await getBuildings({ search: search || undefined, per_page: 20, active_only: true })
  return res.items.map((b) => ({ value: b.id, label: b.name, sublabel: b.code ?? undefined }))
}

export function fetchFloorOptions(buildingId: string | undefined) {
  return async (search: string): Promise<ComboOption[]> => {
    if (!buildingId) return []
    const res = await getFloors({ building_id: buildingId, search: search || undefined, per_page: 20 })
    return res.items.map((f) => ({ value: f.id, label: f.name, sublabel: `Floor ${f.floor_number}` }))
  }
}

export function fetchRoomOptions(floorId: string | undefined, opts: { activeOnly?: boolean } = {}) {
  return async (search: string): Promise<ComboOption[]> => {
    if (!floorId) return []
    const res = await getRooms({
      floor_id: floorId,
      search: search || undefined,
      status: opts.activeOnly ? "active" : undefined,
      per_page: 20,
    })
    return res.items.map((r) => ({
      value: r.id,
      label: r.room_number,
      sublabel: `Capacity ${r.capacity}${r.room_type ? ` · ${r.room_type}` : ""}`,
    }))
  }
}

export function fetchBedOptions(roomId: string | undefined, opts: { availableOnly?: boolean } = {}) {
  return async (search: string): Promise<ComboOption[]> => {
    if (!roomId) return []
    const res = await getBeds({
      room_id: roomId,
      search: search || undefined,
      status: opts.availableOnly ? "available" : undefined,
      per_page: 20,
    })
    return res.items.map((b) => ({ value: b.id, label: `Bed ${b.bed_number}`, sublabel: b.status }))
  }
}

export async function fetchResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20 })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can receive a new admission: excludes anyone currently
 * active/on_leave (already admitted) or with a pending admission, mirroring
 * the same rule admissions.create_admission enforces server-side. */
export async function fetchEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_admission: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can currently have attendance marked or a leave request
 * created: only those who are active or on_leave, mirroring the same
 * "resident_not_active" rule app.attendance.service.mark/bulk_mark and
 * app.leaves.service.create enforce server-side. Used by the Mark Attendance
 * and Bulk Mark dialogs' resident pickers — the Daily Attendance table's own
 * resident filter deliberately keeps using fetchResidentOptions instead,
 * since it's for looking up history and past residents' records are still
 * worth filtering by. */
export async function fetchAttendanceEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_attendance: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can currently have a leave request created: only those who
 * are active or on_leave AND hold an active room allocation, mirroring the
 * same "resident_not_active"/"resident_not_allocated" rules
 * app.leaves.service.create enforces server-side. Deliberately reuses the
 * `eligible_for_attendance` flag — GET /residents has no separate leave flag,
 * and the backend's own eligibility filter docstring confirms this same flag
 * backs both app.attendance.service.mark/bulk_mark and app.leaves.service.create.
 * Used by the New Leave Request dialog's resident picker — the Leave
 * Requests table's own resident filter deliberately keeps using
 * fetchResidentOptions instead, since it's for viewing history. */
export async function fetchLeaveEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_attendance: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can currently be charged or invoiced: only those who hold an
 * active room allocation, mirroring the same "resident_not_allocated" rule
 * app.resident_charges.service.create and app.invoices.service.create_invoice
 * enforce server-side. Used by the Add Charge and Create Invoice dialogs'
 * resident pickers. */
export async function fetchBillingEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_billing: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can currently receive a payment: only those with at least
 * one payable invoice (issued/partially_paid/overdue). Deliberately not
 * allocation-based — a resident who's since checked out must stay payable
 * against a real outstanding invoice. Used by the Record Payment dialog's
 * resident picker; its invoice picker (fetchPayableInvoiceOptions) is already
 * scoped per-resident. */
export async function fetchPaymentEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_payment: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can currently receive a registered guest: excludes anyone
 * checked out, mirroring the same "resident_not_active" rule
 * app.visitors.service.create_visitor enforces server-side on create.
 * on_leave residents stay eligible — leave is temporary, bed still
 * allocated. Used by the Register Visitor dialog's resident picker. */
export async function fetchVisitorEligibleResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_visitor: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Residents who can be allocated a bed: excludes anyone with an active
 * room allocation already, mirroring the same rule
 * allocations.create_allocation (hms_allocate_bed's
 * "resident_already_allocated" error) enforces server-side. Used only by the
 * Allocate Bed / Assign Bed dialogs — other resident pickers (Resident
 * Charges, Invoices, etc.) should keep showing every resident. */
export async function fetchAllocatableResidentOptions(search: string): Promise<ComboOption[]> {
  const res = await searchResidents({ search: search || undefined, per_page: 20, eligible_for_allocation: true })
  return res.items.map((r) => ({
    value: r.id,
    label: [r.first_name, r.last_name].filter(Boolean).join(" "),
    sublabel: r.student_id ?? undefined,
  }))
}

/** Fee structures currently valid to bill against — filters out inactive,
 * expired, and not-yet-started ones via the backend-computed
 * `is_currently_usable` flag, so an invoice/charge picker built on this never
 * offers one that app.fee_structures.service.ensure_usable would reject. */
export async function fetchFeeStructureOptions(search: string): Promise<ComboOption[]> {
  const res = await getFeeStructures({ search: search || undefined, per_page: 50, is_active: true })
  return res.items
    .filter((f) => f.is_currently_usable)
    .map((f) => ({ value: f.id, label: f.name, sublabel: `${f.frequency} · ${formatCurrency(f.amount)}` }))
}

/** A resident's invoices still open to receive a payment against — filters to
 * issued/partially_paid client-side (the invoices list endpoint already
 * returns `balance`, computed server-side, so no backend change is needed
 * here). Used by the Record Payment dialog's invoice picker. */
export function fetchPayableInvoiceOptions(residentId: string | undefined) {
  return async (search: string): Promise<ComboOption[]> => {
    if (!residentId) return []
    const res = await getInvoices({ resident_id: residentId, per_page: 50, search: search || undefined })
    return res.items
      .filter((inv) => inv.status === "issued" || inv.status === "partially_paid")
      .map((inv) => ({
        value: inv.id,
        label: inv.invoice_number,
        sublabel: `Balance: ${formatCurrency(inv.balance)}`,
      }))
  }
}
