export interface User {
  id: string
  role_id: string
  first_name: string
  last_name: string | null
  email: string
  phone: string | null
  profile_picture_url: string | null
  status: string
  email_verified: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: "bearer"
  expires_in: number
  user: User
}

export interface OTPRequestResponse {
  message: string
  expires_in_seconds: number
}

export interface DashboardSummary {
  total_residents: number
  active_residents: number
  total_beds: number
  occupied_beds: number
  available_beds: number
  occupancy_rate: number
  pending_admissions: number
  active_allocations: number
  checked_in_stays: number
  pending_leaves: number
  open_complaints: number
  open_tickets: number
  total_payments: number | string
  total_expenses: number | string
  outstanding_balance: number | string
}

export interface AttendanceReport {
  total: number
  present: number
  absent: number
  late: number
  excused: number
}

export interface OccupancyReport {
  total_beds: number
  occupied: number
  available: number
  cleaning: number
  maintenance: number
  occupancy_rate: number
}

export interface AuditLogItem {
  id: string
  user_id: string | null
  action: string
  module: string
  entity_type: string | null
  entity_id: string | null
  description: string | null
  ip_address: string | null
  created_at: string
}

export interface AuditLogList {
  items: AuditLogItem[]
  total: number
  page: number
  per_page: number
}

export interface NotificationItem {
  id: string
  user_id: string
  title: string
  message: string | null
  type: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationList {
  items: NotificationItem[]
  total: number
  page: number
  per_page: number
}

export interface ApiErrorPayload {
  detail?:
    | string
    | {
        msg?: string
        message?: string
        code?: string
        loc?: unknown[]
        type?: string
      }
  code?: string
}

/* ── Roles / permissions ───────────────────────────────────────── */

export interface RoleWithPermissions {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  is_active: boolean
  permissions: string[]
}

/* ── Hostel structure: Buildings → Floors → Rooms → Beds ─────────── */

export type BuildingType = "boys" | "girls" | "mixed"

export interface Building {
  id: string
  name: string
  code: string | null
  description: string | null
  type: BuildingType
  is_active: boolean
  created_at: string
  updated_at: string
  /** Computed server-side from `hms_building_occupancy()` — aggregated across
   * the building's floors/rooms/beds. 0 for a building with no rooms yet. */
  total_rooms: number
  total_capacity: number
  total_beds: number
  occupied_beds: number
  occupancy_rate: number
}

export interface BuildingList {
  items: Building[]
  total: number
  page: number
  per_page: number
}

export interface BuildingCreateInput {
  name: string
  code?: string | null
  description?: string | null
  type?: BuildingType
  is_active?: boolean
}

export interface BuildingUpdateInput {
  name?: string
  code?: string | null
  description?: string | null
  type?: BuildingType
  is_active?: boolean
}

export interface Floor {
  id: string
  building_id: string
  name: string
  floor_number: number
  description: string | null
  created_at: string
  updated_at: string
  /** `buildings.name` via the building_id FK — not a physical column. */
  building_name: string | null
  /** Computed server-side from `hms_floor_occupancy()` — aggregated across
   * the floor's rooms/beds. 0 for a floor with no rooms yet. */
  total_rooms: number
  total_beds: number
  occupied_beds: number
  available_beds: number
  occupancy_rate: number
}

export interface FloorList {
  items: Floor[]
  total: number
  page: number
  per_page: number
}

export interface FloorCreateInput {
  building_id: string
  name: string
  floor_number: number
  description?: string | null
}

export interface FloorUpdateInput {
  name?: string
  floor_number?: number
  description?: string | null
}

export type RoomStatus = "active" | "inactive" | "maintenance"

export interface RoomResidentRef {
  id: string
  first_name: string
  last_name: string | null
}

export interface Room {
  id: string
  floor_id: string
  room_number: string
  room_type: string | null
  capacity: number
  status: RoomStatus
  description: string | null
  created_at: string
  updated_at: string
  /** Joined via floor_id -> floors -> building_id -> buildings. */
  floor_name: string | null
  building_id: string | null
  building_name: string | null
  building_type: BuildingType | null
  /** Computed server-side from this room's beds. 0 for a room with no beds
   * configured yet. `occupied_beds` mirrors `beds.status = 'occupied'`. */
  total_beds: number
  occupied_beds: number
  available_beds: number
  /** Residents with a currently-active room allocation to a bed in this
   * room. Empty until the allocations flow assigns one. */
  current_residents: RoomResidentRef[]
}

export interface RoomSummary {
  total_rooms: number
  occupied_rooms: number
  available_rooms: number
  full_rooms: number
}

export interface RoomList {
  items: Room[]
  total: number
  page: number
  per_page: number
  summary: RoomSummary
}

export interface RoomCreateInput {
  floor_id: string
  room_number: string
  room_type?: string | null
  capacity: number
  status?: RoomStatus
  description?: string | null
}

export interface RoomUpdateInput {
  room_number?: string
  room_type?: string | null
  capacity?: number
  status?: RoomStatus
  description?: string | null
}

export type BedStatus = "available" | "occupied" | "cleaning" | "maintenance"

export interface Bed {
  id: string
  room_id: string
  bed_number: string
  status: BedStatus
  description: string | null
  created_at: string
  updated_at: string
}

export interface BedList {
  items: Bed[]
  total: number
  page: number
  per_page: number
}

export interface BedCreateInput {
  room_id: string
  bed_number: string
  status?: BedStatus
  description?: string | null
}

export interface BedUpdateInput {
  bed_number?: string
  status?: BedStatus
  description?: string | null
}

/* ── Allocations & Stays ──────────────────────────────────────────── */

export type AllocationStatus = "active" | "transferred" | "completed" | "cancelled"

export interface Allocation {
  id: string
  resident_id: string
  room_id: string
  bed_id: string
  admission_id: string | null
  allocated_from: string
  allocated_until: string | null
  status: AllocationStatus
  reason: string | null
  allocated_by: string | null
  created_at: string
  updated_at: string
  resident?: {
    id: string
    first_name: string
    last_name: string | null
    student_id: string | null
    profile_picture_url: string | null
  } | null
  room?: {
    id: string
    room_number: string
    floor_name: string | null
    building_name: string | null
  } | null
  bed?: { id: string; bed_number: string } | null
  /** Computed fresh from the resident's invoices — same rule as the Room
   * Detail page's `rent_status` (see RentStatus above), never stored. */
  payment_status?: RentStatus | null
}

export interface AllocationSummary {
  total_beds: number
  occupied_beds: number
  available_beds: number
  /** Active allocations whose resident's payment_status isn't "paid". */
  pending_payments: number
}

export interface AllocationList {
  items: Allocation[]
  total: number
  page: number
  per_page: number
  summary: AllocationSummary
}

export interface AllocationCreateInput {
  resident_id: string
  room_id: string
  bed_id: string
  admission_id?: string | null
  allocated_from?: string
  allocated_until?: string | null
  reason?: string | null
}

export interface AllocationTransferInput {
  new_room_id: string
  new_bed_id: string
  reason?: string | null
}

export type StayStatus = "scheduled" | "checked_in" | "checked_out" | "cancelled"

export interface Stay {
  id: string
  resident_id: string
  allocation_id: string
  check_in_at: string | null
  expected_check_out_at: string | null
  actual_check_out_at: string | null
  status: StayStatus
  check_in_by: string | null
  check_out_by: string | null
  check_in_notes: string | null
  check_out_notes: string | null
  created_at: string
  updated_at: string
}

export interface StayList {
  items: Stay[]
  total: number
  page: number
  per_page: number
}

export interface StayCreateInput {
  resident_id: string
  allocation_id: string
  expected_check_out_at?: string | null
  notes?: string | null
}

export interface StayActionInput {
  notes?: string | null
}

/* ── Visitors ──────────────────────────────────────────────────── */

export type VisitorStatus = "expected" | "checked_in" | "checked_out" | "cancelled"

export interface Visitor {
  id: string
  resident_id: string
  visitor_name: string
  visitor_phone: string | null
  relationship: string | null
  identification_type: string | null
  identification_number: string | null
  purpose: string | null
  expected_at: string | null
  status: VisitorStatus
  is_blacklisted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VisitorList {
  items: Visitor[]
  total: number
  page: number
  per_page: number
}

export interface VisitorCreateInput {
  resident_id: string
  visitor_name: string
  visitor_phone?: string | null
  relationship?: string | null
  identification_type?: string | null
  identification_number?: string | null
  purpose?: string | null
  expected_at?: string | null
}

export interface VisitorUpdateInput {
  visitor_name?: string
  visitor_phone?: string | null
  relationship?: string | null
  identification_type?: string | null
  identification_number?: string | null
  purpose?: string | null
  expected_at?: string | null
  is_blacklisted?: boolean
}

/* ── Visitor logs (check-in / check-out) ──────────────────────── */

export interface VisitorLog {
  id: string
  visitor_id: string
  check_in_at: string | null
  check_out_at: string | null
  checked_in_by: string | null
  checked_out_by: string | null
  remarks: string | null
  created_at: string
}

export interface VisitorLogList {
  items: VisitorLog[]
  total: number
  page: number
  per_page: number
}

export interface VisitorLogCheckInInput {
  visitor_id: string
  remarks?: string | null
}

export interface VisitorLogCheckOutInput {
  remarks?: string | null
}

/* ── Gate Passes ───────────────────────────────────────────────── */

export type GatePassStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "issued"
  | "exited"
  | "returned"
  | "cancelled"

export interface GatePass {
  id: string
  resident_id: string
  pass_number: string
  reason: string
  destination: string | null
  /** Planned departure time set at creation; overwritten with the actual
   * exit timestamp once the pass is marked exited. */
  departure_at: string | null
  expected_return_at: string | null
  actual_return_at: string | null
  status: GatePassStatus
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  issued_by: string | null
  issued_at: string | null
  /** Set by both mark-exit and mark-return — the return action overwrites
   * whoever verified the exit. */
  verified_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface GatePassList {
  items: GatePass[]
  total: number
  page: number
  per_page: number
}

export interface GatePassCreateInput {
  resident_id: string
  reason: string
  destination?: string | null
  departure_at?: string | null
  expected_return_at?: string | null
  notes?: string | null
}

export interface GatePassActionInput {
  notes?: string | null
}

/* ── Residents ─────────────────────────────────────────────────── */

export type ResidentStatus = "applicant" | "active" | "on_leave" | "checked_out" | "inactive"

export interface Resident {
  id: string
  user_id: string | null
  student_id: string | null
  first_name: string
  last_name: string | null
  date_of_birth: string | null
  gender: string | null
  email: string | null
  phone: string | null
  profile_picture_url: string | null
  address: string | null
  institution: string | null
  department: string | null
  program: string | null
  semester: string | null
  guardian_name: string | null
  guardian_relationship: string | null
  guardian_phone: string | null
  guardian_address: string | null
  emergency_contact_name: string | null
  emergency_contact_relationship: string | null
  emergency_contact_phone: string | null
  status: ResidentStatus
  created_at: string
  updated_at: string
}

export interface ResidentSummary {
  total: number
  active: number
  on_leave: number
  applicant: number
}

export interface ResidentList {
  items: Resident[]
  total: number
  page: number
  per_page: number
  summary: ResidentSummary
}

export interface ResidentCreateInput {
  first_name: string
  last_name?: string | null
  date_of_birth?: string | null
  gender?: string | null
  email?: string | null
  phone?: string | null
  profile_picture_url?: string | null
  address?: string | null
  student_id?: string | null
  institution?: string | null
  department?: string | null
  program?: string | null
  semester?: string | null
  guardian_name?: string | null
  guardian_relationship?: string | null
  guardian_phone?: string | null
  guardian_address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_relationship?: string | null
  emergency_contact_phone?: string | null
  status?: ResidentStatus
}

export type ResidentUpdateInput = Partial<ResidentCreateInput>

export interface ResidentCheckoutInput {
  reason?: string | null
}

/* ── Resident documents ────────────────────────────────────────── */

export interface ResidentDocument {
  id: string
  resident_id: string
  document_type: string
  document_number: string | null
  file_url: string
  verified: boolean
  uploaded_at: string
  verified_at: string | null
  verified_by: string | null
}

export interface ResidentDocumentList {
  items: ResidentDocument[]
  total: number
  page: number
  per_page: number
}

export interface ResidentDocumentCreateInput {
  resident_id: string
  document_type: string
  document_number?: string | null
  file_url: string
}

/* ── Admissions (full record, for the resident detail page) ──────── */

export type AdmissionFullStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface AdmissionResidentRef {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  profile_picture_url: string | null
  program: string | null
  semester: string | null
  institution: string | null
}

export interface AdmissionFull {
  id: string
  resident_id: string
  admission_number: string
  application_date: string
  admission_date: string | null
  status: AdmissionFullStatus
  notes: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_at: string | null
  created_at: string
  updated_at: string
  /** Only populated by the list endpoint (embedded join) — null on
   * create/get/transition responses. */
  resident: AdmissionResidentRef | null
}

export interface AdmissionCreateInput {
  resident_id: string
  admission_number?: string | null
  application_date?: string
  admission_date?: string | null
  notes?: string | null
}

export interface AdmissionFullList {
  items: AdmissionFull[]
  total: number
  page: number
  per_page: number
}

/* ── Residents / Admissions (minimal refs for pickers) ───────────── */

export interface ResidentRef {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  status: string
}

export interface ResidentRefList {
  items: ResidentRef[]
  total: number
  page: number
  per_page: number
}

export interface AdmissionRef {
  id: string
  resident_id: string
  admission_number: string
  status: string
}

export interface AdmissionRefList {
  items: AdmissionRef[]
  total: number
  page: number
  per_page: number
}

/* ── Room detail (bed management) ─────────────────────────────────── */

export type RentStatusValue = "paid" | "pending" | "overdue" | "no_dues"

export interface RentStatus {
  status: RentStatusValue
  label: string
  days: number | null
}

export interface RoomDetailResident {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  program: string | null
  department: string | null
  semester: string | null
  profile_picture_url: string | null
}

export interface RoomDetailBed {
  id: string
  bed_number: string
  status: BedStatus
  description: string | null
  allocation_id: string | null
  resident: RoomDetailResident | null
  check_in_date: string | null
  rent_status: RentStatus | null
}

export interface RoomDetailSummary {
  total_beds: number
  occupied_beds: number
  vacant_beds: number
  cleaning_beds: number
}

export interface RoomDetail {
  room: Room
  summary: RoomDetailSummary
  beds: RoomDetailBed[]
}

/* ── Fee structures (Finance) ─────────────────────────────────────── */

export type FeeStructureFrequency = "Monthly" | "Weekly" | "Yearly" | "One-time"

/** Computed fresh by the backend on every read (see
 * app.fee_structures.service.compute_availability) — never stored. */
export type FeeStructureDateStatus = "current" | "continuous" | "not_yet_active" | "expired"

export interface FeeStructure {
  id: string
  name: string
  description: string | null
  amount: number | string
  frequency: string
  is_active: boolean
  effective_from: string | null
  effective_until: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  date_status: FeeStructureDateStatus
  /** is_active AND currently inside its effective window. Drives the muted
   * card treatment and is the filter fetchFeeStructureOptions applies. */
  is_currently_usable: boolean
}

export interface FeeStructureSummary {
  total: number
  active: number
  inactive: number
}

export interface FeeStructureList {
  items: FeeStructure[]
  total: number
  page: number
  per_page: number
  summary: FeeStructureSummary
}

export interface FeeStructureCreateInput {
  name: string
  description?: string | null
  amount: number | string
  frequency: string
  is_active?: boolean
  effective_from?: string | null
  effective_until?: string | null
}

export type FeeStructureUpdateInput = Partial<FeeStructureCreateInput>

/* ── Resident charges (Finance) ───────────────────────────────────── */

export type ResidentChargeStatus =
  | "pending"
  | "invoiced"
  | "paid"
  | "partially_paid"
  | "waived"
  | "cancelled"
  | "overdue"

export interface ResidentChargeResidentRef {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  profile_picture_url: string | null
}

export interface ResidentChargeFeeStructureRef {
  id: string
  name: string
  amount: number | string
  frequency: string
}

export interface ResidentChargeInvoiceRef {
  id: string
  invoice_number: string
}

export interface ResidentCharge {
  id: string
  resident_id: string
  fee_structure_id: string | null
  charge_type: string
  description: string | null
  amount: number | string
  amount_paid: number | string
  charge_date: string
  due_date: string | null
  status: ResidentChargeStatus
  reference_type: string | null
  reference_id: string | null
  invoice_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  /** Computed fresh by the backend on every read (amount - amount_paid), never stored. */
  balance: number | string
  /** Resolved from the resident's active room allocation, not a stored column. */
  room_number: string | null
  resident: ResidentChargeResidentRef | null
  fee_structure: ResidentChargeFeeStructureRef | null
  invoice: ResidentChargeInvoiceRef | null
}

export interface ResidentChargeSummary {
  total: number
  pending: number
  invoiced: number
  paid: number
}

export interface ResidentChargeList {
  items: ResidentCharge[]
  total: number
  page: number
  per_page: number
  summary: ResidentChargeSummary
}

export interface ResidentChargeCreateInput {
  resident_id: string
  fee_structure_id?: string | null
  charge_type: string
  description?: string | null
  amount: number | string
  charge_date?: string
  due_date?: string | null
}

export interface ResidentChargeUpdateInput {
  description?: string | null
  due_date?: string | null
  status?: ResidentChargeStatus
  amount_paid?: number | string | null
}

/* ── Invoices (Finance) ───────────────────────────────────────────── */

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled"

export interface InvoiceResidentRef {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  profile_picture_url: string | null
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  fee_structure_id: string | null
  description: string
  quantity: number | string
  unit_amount: number | string
  total_amount: number | string
}

export interface Invoice {
  id: string
  resident_id: string
  invoice_number: string
  issue_date: string
  due_date: string | null
  subtotal: number | string
  discount: number | string
  total_amount: number | string
  status: InvoiceStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  items: InvoiceItem[] | null
  resident: InvoiceResidentRef | null
  /** Computed fresh by the backend on every read (sum of completed payments
   * against this invoice), never stored — always 0 until Payments is built. */
  amount_paid: number | string
  balance: number | string
}

export interface InvoiceSummary {
  total: number
  draft: number
  issued_unpaid: number
  paid: number
}

export interface InvoiceList {
  items: Invoice[]
  total: number
  page: number
  per_page: number
  summary: InvoiceSummary
}

export interface InvoiceItemCreateInput {
  fee_structure_id?: string | null
  description: string
  quantity: number | string
  unit_amount: number | string
}

export interface InvoiceCreateInput {
  resident_id: string
  issue_date?: string
  due_date?: string | null
  discount?: number | string
  notes?: string | null
  items: InvoiceItemCreateInput[]
  /** Pending resident_charges ids to fold into this invoice as line items —
   * the backend derives each item's description/amount from the charge. */
  resident_charge_ids?: string[]
}

export interface InvoiceUpdateInput {
  due_date?: string | null
  notes?: string | null
  discount?: number | string
}

/* ── Attendance ────────────────────────────────────────────────────── */

export type AttendanceStatus = "present" | "absent" | "late" | "excused"

export interface AttendanceRecord {
  id: string
  resident_id: string
  attendance_date: string
  status: AttendanceStatus
  remarks: string | null
  marked_by: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceList {
  items: AttendanceRecord[]
  total: number
  page: number
  per_page: number
}

export interface AttendanceMarkInput {
  resident_id: string
  attendance_date: string
  status: AttendanceStatus
  remarks?: string | null
}

export interface AttendanceUpdateInput {
  status?: AttendanceStatus
  remarks?: string | null
}

export interface AttendanceBulkMarkInput {
  records: AttendanceMarkInput[]
}

export interface AttendanceBulkSkipped {
  resident_id: string
  attendance_date: string
  reason: string
}

export interface AttendanceBulkResult {
  created: AttendanceRecord[]
  skipped: AttendanceBulkSkipped[]
  created_count: number
  skipped_count: number
}

/* ── Leave Requests ────────────────────────────────────────────────── */

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface LeaveRequest {
  id: string
  resident_id: string
  start_date: string
  end_date: string
  reason: string
  destination: string | null
  contact_phone: string | null
  status: LeaveStatus
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

export interface LeaveRequestList {
  items: LeaveRequest[]
  total: number
  page: number
  per_page: number
}

export interface LeaveRequestCreateInput {
  resident_id: string
  start_date: string
  end_date: string
  reason: string
  destination?: string | null
  contact_phone?: string | null
}

export interface LeaveReviewInput {
  review_notes?: string | null
}

/** `completed` is never actually written by app.leaves.service — the leaves
 * state machine only ever produces pending/approved/rejected/cancelled — so
 * it's always 0. Kept here only because the backend response includes it. */
export interface LeaveReport {
  pending: number
  approved: number
  rejected: number
  completed: number
  cancelled: number
}

/* ── Payments (Finance) ───────────────────────────────────────────── */

export type PaymentMethod = "cash" | "bank_transfer" | "card" | "online"

export interface PaymentResidentRef {
  id: string
  first_name: string
  last_name: string | null
  student_id: string | null
  profile_picture_url: string | null
}

export interface PaymentInvoiceRef {
  id: string
  invoice_number: string
}

export interface PaymentReceivedByRef {
  id: string
  first_name: string
  last_name: string | null
}

export interface Payment {
  id: string
  resident_id: string
  invoice_id: string | null
  payment_reference: string
  amount: number | string
  payment_method: string | null
  payment_date: string
  status: string
  transaction_reference: string | null
  notes: string | null
  received_by: string | null
  created_at: string
  updated_at: string
  resident: PaymentResidentRef | null
  invoice: PaymentInvoiceRef | null
  received_by_user: PaymentReceivedByRef | null
}

export interface PaymentSummary {
  total_collected: number | string
  this_month: number | string
  total_payments: number
  outstanding: number | string
}

export interface PaymentList {
  items: Payment[]
  total: number
  page: number
  per_page: number
  summary: PaymentSummary
}

export interface PaymentCreateInput {
  resident_id: string
  invoice_id: string
  payment_reference?: string | null
  amount: number | string
  payment_method?: string | null
  transaction_reference?: string | null
  notes?: string | null
}
