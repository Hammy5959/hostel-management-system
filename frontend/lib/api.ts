import { getToken } from "@/lib/auth"
import type {
  AdmissionCreateInput,
  AdmissionFull,
  AdmissionFullList,
  AdmissionRefList,
  Allocation,
  AllocationCreateInput,
  AllocationList,
  AllocationTransferInput,
  ApiErrorPayload,
  AttendanceBulkMarkInput,
  AttendanceBulkResult,
  AttendanceList,
  AttendanceMarkInput,
  AttendanceRecord,
  AttendanceReport,
  AttendanceUpdateInput,
  AuditLogList,
  Bed,
  BedCreateInput,
  BedList,
  BedUpdateInput,
  Building,
  BuildingCreateInput,
  BuildingList,
  BuildingUpdateInput,
  DashboardSummary,
  FeeStructure,
  FeeStructureCreateInput,
  FeeStructureList,
  FeeStructureUpdateInput,
  Floor,
  FloorCreateInput,
  FloorList,
  FloorUpdateInput,
  LeaveReport,
  LeaveReviewInput,
  LeaveRequest,
  LeaveRequestCreateInput,
  LeaveRequestList,
  NotificationItem,
  NotificationList,
  OccupancyReport,
  OTPRequestResponse,
  Resident,
  ResidentCheckoutInput,
  ResidentCreateInput,
  Invoice,
  InvoiceCreateInput,
  InvoiceList,
  InvoiceUpdateInput,
  Payment,
  PaymentCreateInput,
  PaymentList,
  ResidentCharge,
  ResidentChargeCreateInput,
  ResidentChargeList,
  ResidentChargeUpdateInput,
  ResidentDocument,
  ResidentDocumentCreateInput,
  ResidentDocumentList,
  ResidentList,
  ResidentRefList,
  ResidentUpdateInput,
  Room,
  RoomCreateInput,
  RoomDetail,
  RoomList,
  RoomUpdateInput,
  RoleWithPermissions,
  Stay,
  StayActionInput,
  StayCreateInput,
  StayList,
  TokenResponse,
  User,
} from "@/lib/types"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  auth?: boolean
}

/** Fetch wrapper that attaches the JWT and normalizes errors. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options

  const requestHeaders = new Headers(headers)
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json")
  }
  if (auth) {
    const token = getToken()
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`)
    }
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    )
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(
      extractErrorMessage(payload),
      response.status,
      extractErrorCode(payload),
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function extractErrorCode(payload: ApiErrorPayload | null | undefined): string | undefined {
  if (!payload) return undefined
  // The API envelope is { detail: { code, message } }, but some legacy
  // responses put `code` at the top level.
  if (typeof payload.code === "string" && payload.code) return payload.code
  const detail = payload.detail
  if (typeof detail === "object" && detail && typeof detail.code === "string" && detail.code) {
    return detail.code
  }
  return undefined
}

function extractErrorMessage(payload: ApiErrorPayload | null | undefined): string {
  if (!payload) return "Something went wrong. Please try again."
  const detail = payload.detail
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail
  }
  if (Array.isArray(detail)) {
    const msg = detail[0]?.msg
    if (msg) return msg
  }
  if (typeof detail === "object" && detail) {
    const msg = detail.message ?? detail.msg
    if (msg) return msg
  }
  return "Something went wrong. Please try again."
}

/* ── Auth ─────────────────────────────────────────────────────── */

export function requestOtp(
  email: string,
  password: string,
): Promise<OTPRequestResponse> {
  return apiFetch<OTPRequestResponse>("/auth/request-otp", {
    method: "POST",
    auth: false,
    body: { email, password },
  })
}

export function verifyOtp(email: string, otp: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/verify-otp", {
    method: "POST",
    auth: false,
    body: { email, otp },
  })
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/auth/me")
}

/* ── Dashboard / reports ──────────────────────────────────────── */

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/reports/summary")
}

export function getOccupancyReport(): Promise<OccupancyReport> {
  return apiFetch<OccupancyReport>("/reports/occupancy")
}

export interface AttendanceReportParams {
  date_from?: string
  date_to?: string
}

export function getAttendanceReport(params: AttendanceReportParams = {}): Promise<AttendanceReport> {
  return apiFetch<AttendanceReport>(`/reports/attendance${toQueryString({ ...params })}`)
}

export function getLeaveReport(): Promise<LeaveReport> {
  return apiFetch<LeaveReport>("/reports/leaves")
}

/* ── Activity / audit ─────────────────────────────────────────── */

export function getAuditLogs(perPage = 6): Promise<AuditLogList> {
  return apiFetch<AuditLogList>(`/audit-logs?per_page=${perPage}`)
}

/* ── Notifications ────────────────────────────────────────────── */

export function getNotifications(perPage = 8): Promise<NotificationList> {
  return apiFetch<NotificationList>(`/notifications?per_page=${perPage}`)
}

export function getUnreadNotificationCount(): Promise<{ unread_count: number }> {
  return apiFetch<{ unread_count: number }>("/notifications/unread-count")
}

export function markNotificationRead(id: string): Promise<NotificationItem> {
  return apiFetch<NotificationItem>(`/notifications/${id}/read`, { method: "POST" })
}

export function markAllNotificationsRead(): Promise<{ success?: boolean }> {
  return apiFetch<{ success?: boolean }>("/notifications/read-all", { method: "POST" })
}

/* ── Uploads (Supabase Storage relay) ─────────────────────────── */

/** Multipart upload — bypasses apiFetch's JSON body handling so the browser
 * can set its own multipart/form-data boundary header. */
export async function uploadProfilePhoto(file: File): Promise<{ url: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append("file", file)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/uploads/profile-photo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    })
  } catch {
    throw new ApiError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    )
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(extractErrorMessage(payload), response.status, extractErrorCode(payload))
  }

  return (await response.json()) as { url: string }
}

/* ── Roles (permission resolution only) ───────────────────────── */

export function getRole(roleId: string): Promise<RoleWithPermissions> {
  return apiFetch<RoleWithPermissions>(`/roles/${roleId}`)
}

/* ── Users (name resolution only, e.g. "marked by" — requires users.view) ── */

export function getUser(id: string): Promise<User> {
  return apiFetch<User>(`/users/${id}`)
}

/* ── Query string helper ──────────────────────────────────────── */

function toQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

/* ── Buildings ─────────────────────────────────────────────────── */

export interface BuildingListParams {
  page?: number
  per_page?: number
  search?: string
  active_only?: boolean
  type?: string
}

export function getBuildings(params: BuildingListParams = {}): Promise<BuildingList> {
  return apiFetch<BuildingList>(`/buildings${toQueryString({ ...params })}`)
}

export function getBuilding(id: string): Promise<Building> {
  return apiFetch<Building>(`/buildings/${id}`)
}

export function createBuilding(payload: BuildingCreateInput): Promise<Building> {
  return apiFetch<Building>("/buildings", { method: "POST", body: payload })
}

export function updateBuilding(id: string, payload: BuildingUpdateInput): Promise<Building> {
  return apiFetch<Building>(`/buildings/${id}`, { method: "PATCH", body: payload })
}

/* ── Floors ────────────────────────────────────────────────────── */

export interface FloorListParams {
  page?: number
  per_page?: number
  building_id?: string
  search?: string
}

export function getFloors(params: FloorListParams = {}): Promise<FloorList> {
  return apiFetch<FloorList>(`/floors${toQueryString({ ...params })}`)
}

export function getFloor(id: string): Promise<Floor> {
  return apiFetch<Floor>(`/floors/${id}`)
}

export function createFloor(payload: FloorCreateInput): Promise<Floor> {
  return apiFetch<Floor>("/floors", { method: "POST", body: payload })
}

export function updateFloor(id: string, payload: FloorUpdateInput): Promise<Floor> {
  return apiFetch<Floor>(`/floors/${id}`, { method: "PATCH", body: payload })
}

/* ── Rooms ─────────────────────────────────────────────────────── */

export interface RoomListParams {
  page?: number
  per_page?: number
  floor_id?: string
  building_id?: string
  status?: string
  search?: string
}

export function getRooms(params: RoomListParams = {}): Promise<RoomList> {
  return apiFetch<RoomList>(`/rooms${toQueryString({ ...params })}`)
}

export function getRoom(id: string): Promise<Room> {
  return apiFetch<Room>(`/rooms/${id}`)
}

export function getRoomDetail(id: string): Promise<RoomDetail> {
  return apiFetch<RoomDetail>(`/rooms/${id}/detail`)
}

export function createRoom(payload: RoomCreateInput): Promise<Room> {
  return apiFetch<Room>("/rooms", { method: "POST", body: payload })
}

export function updateRoom(id: string, payload: RoomUpdateInput): Promise<Room> {
  return apiFetch<Room>(`/rooms/${id}`, { method: "PATCH", body: payload })
}

/* ── Beds ──────────────────────────────────────────────────────── */

export interface BedListParams {
  page?: number
  per_page?: number
  room_id?: string
  status?: string
  search?: string
}

export function getBeds(params: BedListParams = {}): Promise<BedList> {
  return apiFetch<BedList>(`/beds${toQueryString({ ...params })}`)
}

export function getBed(id: string): Promise<Bed> {
  return apiFetch<Bed>(`/beds/${id}`)
}

export function createBed(payload: BedCreateInput): Promise<Bed> {
  return apiFetch<Bed>("/beds", { method: "POST", body: payload })
}

export function updateBed(id: string, payload: BedUpdateInput): Promise<Bed> {
  return apiFetch<Bed>(`/beds/${id}`, { method: "PATCH", body: payload })
}

/* ── Room allocations ──────────────────────────────────────────── */

export interface AllocationListParams {
  page?: number
  per_page?: number
  resident_id?: string
  room_id?: string
  building_id?: string
  status?: string
  active_only?: boolean
  search?: string
  date_from?: string
}

export function getAllocations(params: AllocationListParams = {}): Promise<AllocationList> {
  return apiFetch<AllocationList>(`/room-allocations${toQueryString({ ...params })}`)
}

export function createAllocation(payload: AllocationCreateInput): Promise<Allocation> {
  return apiFetch<Allocation>("/room-allocations", { method: "POST", body: payload })
}

export function transferAllocation(id: string, payload: AllocationTransferInput): Promise<Allocation> {
  return apiFetch<Allocation>(`/room-allocations/${id}/transfer`, { method: "POST", body: payload })
}

export function releaseAllocation(id: string): Promise<Allocation> {
  return apiFetch<Allocation>(`/room-allocations/${id}/release`, { method: "POST" })
}

/* ── Resident stays (check-in / check-out) ────────────────────── */

export interface StayListParams {
  page?: number
  per_page?: number
  resident_id?: string
  status?: string
}

export function getStays(params: StayListParams = {}): Promise<StayList> {
  return apiFetch<StayList>(`/resident-stays${toQueryString({ ...params })}`)
}

export function createStay(payload: StayCreateInput): Promise<Stay> {
  return apiFetch<Stay>("/resident-stays", { method: "POST", body: payload })
}

export function checkInStay(id: string, payload: StayActionInput = {}): Promise<Stay> {
  return apiFetch<Stay>(`/resident-stays/${id}/check-in`, { method: "POST", body: payload })
}

export function checkOutStay(id: string, payload: StayActionInput = {}): Promise<Stay> {
  return apiFetch<Stay>(`/resident-stays/${id}/check-out`, { method: "POST", body: payload })
}

/* ── Residents ─────────────────────────────────────────────────── */

export interface ResidentListParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  institution?: string
}

export function getResidents(params: ResidentListParams = {}): Promise<ResidentList> {
  return apiFetch<ResidentList>(`/residents${toQueryString({ ...params })}`)
}

export function getResident(id: string): Promise<Resident> {
  return apiFetch<Resident>(`/residents/${id}`)
}

export function createResident(payload: ResidentCreateInput): Promise<Resident> {
  return apiFetch<Resident>("/residents", { method: "POST", body: payload })
}

export function updateResident(id: string, payload: ResidentUpdateInput): Promise<Resident> {
  return apiFetch<Resident>(`/residents/${id}`, { method: "PATCH", body: payload })
}

export function getResidentInstitutions(): Promise<string[]> {
  return apiFetch<string[]>("/residents/institutions")
}

export function checkoutResident(id: string, payload: ResidentCheckoutInput = {}): Promise<Resident> {
  return apiFetch<Resident>(`/residents/${id}/checkout`, { method: "POST", body: payload })
}

export function markResidentReturned(id: string): Promise<Resident> {
  return apiFetch<Resident>(`/residents/${id}/mark-returned`, { method: "POST" })
}

/* ── Resident documents ────────────────────────────────────────── */

export interface ResidentDocumentListParams {
  page?: number
  per_page?: number
  resident_id?: string
}

export function getResidentDocuments(
  params: ResidentDocumentListParams = {},
): Promise<ResidentDocumentList> {
  return apiFetch<ResidentDocumentList>(`/resident-documents${toQueryString({ ...params })}`)
}

export function createResidentDocument(
  payload: ResidentDocumentCreateInput,
): Promise<ResidentDocument> {
  return apiFetch<ResidentDocument>("/resident-documents", { method: "POST", body: payload })
}

export function verifyResidentDocument(id: string): Promise<ResidentDocument> {
  return apiFetch<ResidentDocument>(`/resident-documents/${id}/verify`, { method: "POST" })
}

/* ── Admissions (full records, for the resident detail page) ─────── */

export interface AdmissionListParams {
  page?: number
  per_page?: number
  resident_id?: string
  status?: string
  search?: string
}

export function getAdmissions(params: AdmissionListParams = {}): Promise<AdmissionFullList> {
  return apiFetch<AdmissionFullList>(`/admissions${toQueryString({ ...params })}`)
}

export function createAdmission(payload: AdmissionCreateInput): Promise<AdmissionFull> {
  return apiFetch<AdmissionFull>("/admissions", { method: "POST", body: payload })
}

export function approveAdmission(id: string): Promise<AdmissionFull> {
  return apiFetch<AdmissionFull>(`/admissions/${id}/approve`, { method: "POST" })
}

export function rejectAdmission(id: string, notes?: string | null): Promise<AdmissionFull> {
  return apiFetch<AdmissionFull>(
    `/admissions/${id}/reject${toQueryString({ notes: notes || undefined })}`,
    { method: "POST" },
  )
}

export function cancelAdmission(id: string): Promise<AdmissionFull> {
  return apiFetch<AdmissionFull>(`/admissions/${id}/cancel`, { method: "POST" })
}

/* ── Residents / Admissions (minimal, for pickers used by Allocations) ── */

export interface ResidentSearchParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  eligible_for_admission?: boolean
  eligible_for_allocation?: boolean
  eligible_for_attendance?: boolean
  eligible_for_billing?: boolean
  eligible_for_payment?: boolean
}

export function searchResidents(params: ResidentSearchParams = {}): Promise<ResidentRefList> {
  return apiFetch<ResidentRefList>(`/residents${toQueryString({ ...params })}`)
}

export interface AdmissionSearchParams {
  page?: number
  per_page?: number
  resident_id?: string
  status?: string
  available_for_allocation?: boolean
}

export function searchAdmissions(params: AdmissionSearchParams = {}): Promise<AdmissionRefList> {
  return apiFetch<AdmissionRefList>(`/admissions${toQueryString({ ...params })}`)
}

/* ── Fee structures (Finance) ──────────────────────────────────── */

export interface FeeStructureListParams {
  page?: number
  per_page?: number
  search?: string
  is_active?: boolean
}

export function getFeeStructures(params: FeeStructureListParams = {}): Promise<FeeStructureList> {
  return apiFetch<FeeStructureList>(`/fee-structures${toQueryString({ ...params })}`)
}

export function getFeeStructure(id: string): Promise<FeeStructure> {
  return apiFetch<FeeStructure>(`/fee-structures/${id}`)
}

export function createFeeStructure(payload: FeeStructureCreateInput): Promise<FeeStructure> {
  return apiFetch<FeeStructure>("/fee-structures", { method: "POST", body: payload })
}

export function updateFeeStructure(id: string, payload: FeeStructureUpdateInput): Promise<FeeStructure> {
  return apiFetch<FeeStructure>(`/fee-structures/${id}`, { method: "PATCH", body: payload })
}

/* ── Resident charges (Finance) ──────────────────────────────────── */

export interface ResidentChargeListParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  resident_id?: string
}

export function getResidentCharges(params: ResidentChargeListParams = {}): Promise<ResidentChargeList> {
  return apiFetch<ResidentChargeList>(`/resident-charges${toQueryString({ ...params })}`)
}

export function getResidentCharge(id: string): Promise<ResidentCharge> {
  return apiFetch<ResidentCharge>(`/resident-charges/${id}`)
}

export function createResidentCharge(payload: ResidentChargeCreateInput): Promise<ResidentCharge> {
  return apiFetch<ResidentCharge>("/resident-charges", { method: "POST", body: payload })
}

export function updateResidentCharge(id: string, payload: ResidentChargeUpdateInput): Promise<ResidentCharge> {
  return apiFetch<ResidentCharge>(`/resident-charges/${id}`, { method: "PATCH", body: payload })
}

/* ── Invoices (Finance) ──────────────────────────────────────────── */

export interface InvoiceListParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  resident_id?: string
  date_from?: string
  date_to?: string
}

export function getInvoices(params: InvoiceListParams = {}): Promise<InvoiceList> {
  return apiFetch<InvoiceList>(`/invoices${toQueryString({ ...params })}`)
}

export function getInvoice(id: string): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}`)
}

export function createInvoice(payload: InvoiceCreateInput): Promise<Invoice> {
  return apiFetch<Invoice>("/invoices", { method: "POST", body: payload })
}

export function updateInvoice(id: string, payload: InvoiceUpdateInput): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}`, { method: "PATCH", body: payload })
}

export function issueInvoice(id: string): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}/issue`, { method: "POST" })
}

export function cancelInvoice(id: string): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}/cancel`, { method: "POST" })
}

/* ── Payments (Finance) ────────────────────────────────────────────── */

export interface PaymentListParams {
  page?: number
  per_page?: number
  search?: string
  resident_id?: string
  invoice_id?: string
  payment_method?: string
  date_from?: string
  date_to?: string
}

export function getPayments(params: PaymentListParams = {}): Promise<PaymentList> {
  return apiFetch<PaymentList>(`/payments${toQueryString({ ...params })}`)
}

export function recordPayment(payload: PaymentCreateInput): Promise<Payment> {
  return apiFetch<Payment>("/payments", { method: "POST", body: payload })
}

/* ── Attendance ────────────────────────────────────────────────────── */

export interface AttendanceListParams {
  page?: number
  per_page?: number
  resident_id?: string
  date_from?: string
  date_to?: string
  status?: string
}

export function getAttendance(params: AttendanceListParams = {}): Promise<AttendanceList> {
  return apiFetch<AttendanceList>(`/attendance${toQueryString({ ...params })}`)
}

export function markAttendance(payload: AttendanceMarkInput): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>("/attendance", { method: "POST", body: payload })
}

export function bulkMarkAttendance(payload: AttendanceBulkMarkInput): Promise<AttendanceBulkResult> {
  return apiFetch<AttendanceBulkResult>("/attendance/bulk", { method: "POST", body: payload })
}

export function updateAttendance(id: string, payload: AttendanceUpdateInput): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`/attendance/${id}`, { method: "PATCH", body: payload })
}

/* ── Leave Requests ────────────────────────────────────────────────── */

export interface LeaveRequestListParams {
  page?: number
  per_page?: number
  resident_id?: string
  status?: string
  date_from?: string
  date_to?: string
}

export function getLeaveRequests(params: LeaveRequestListParams = {}): Promise<LeaveRequestList> {
  return apiFetch<LeaveRequestList>(`/leave-requests${toQueryString({ ...params })}`)
}

export function createLeaveRequest(payload: LeaveRequestCreateInput): Promise<LeaveRequest> {
  return apiFetch<LeaveRequest>("/leave-requests", { method: "POST", body: payload })
}

export function approveLeaveRequest(id: string, payload: LeaveReviewInput = {}): Promise<LeaveRequest> {
  return apiFetch<LeaveRequest>(`/leave-requests/${id}/approve`, { method: "POST", body: payload })
}

export function rejectLeaveRequest(id: string, payload: LeaveReviewInput = {}): Promise<LeaveRequest> {
  return apiFetch<LeaveRequest>(`/leave-requests/${id}/reject`, { method: "POST", body: payload })
}

export function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  return apiFetch<LeaveRequest>(`/leave-requests/${id}/cancel`, { method: "POST" })
}
