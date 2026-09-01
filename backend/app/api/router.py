"""Aggregates all v1 API routers under a single versioned router."""

from fastapi import APIRouter

api_router = APIRouter()

from app.admissions.routes import router as admissions_router
from app.allocations.routes import router as allocations_router
from app.asset_assignments.routes import router as asset_assignments_router
from app.assets.routes import router as assets_router
from app.attendance.routes import router as attendance_router
from app.audit.routes import router as audit_router
from app.auth.routes import router as auth_router
from app.beds.routes import router as beds_router
from app.buildings.routes import router as buildings_router
from app.complaints.routes import router as complaints_router
from app.emergency_contacts.routes import router as emergency_contacts_router
from app.expenses.routes import router as expenses_router
from app.fee_structures.routes import router as fee_structures_router
from app.floors.routes import router as floors_router
from app.gate_passes.routes import router as gate_passes_router
from app.hostel_settings.routes import router as hostel_settings_router
from app.inventory_categories.routes import router as inventory_categories_router
from app.inventory_items.routes import router as inventory_items_router
from app.invoices.routes import router as invoices_router
from app.leaves.routes import router as leaves_router
from app.maintenance_tickets.routes import router as maintenance_tickets_router
from app.meals.routes import router as meals_router
from app.mess_menus.routes import router as mess_menus_router
from app.notices.routes import router as notices_router
from app.notifications.routes import router as notifications_router
from app.payments.routes import router as payments_router
from app.permissions.routes import router as permissions_router
from app.reports.routes import router as reports_router
from app.resident_charges.routes import router as resident_charges_router
from app.resident_documents.routes import router as resident_documents_router
from app.residents.routes import router as residents_router
from app.roles.routes import router as roles_router
from app.rooms.routes import router as rooms_router
from app.security_deposits.routes import router as security_deposits_router
from app.staff.routes import router as staff_router
from app.stays.routes import router as stays_router
from app.uploads.routes import router as uploads_router
from app.users.routes import router as users_router
from app.visitor_logs.routes import router as visitor_logs_router
from app.visitors.routes import router as visitors_router

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(staff_router)
api_router.include_router(roles_router)
api_router.include_router(permissions_router)
api_router.include_router(hostel_settings_router)
api_router.include_router(buildings_router)
api_router.include_router(floors_router)
api_router.include_router(rooms_router)
api_router.include_router(beds_router)
api_router.include_router(residents_router)
api_router.include_router(uploads_router)
api_router.include_router(resident_documents_router)
api_router.include_router(emergency_contacts_router)
api_router.include_router(admissions_router)
api_router.include_router(allocations_router)
api_router.include_router(stays_router)
api_router.include_router(attendance_router)
api_router.include_router(leaves_router)
api_router.include_router(visitors_router)
api_router.include_router(visitor_logs_router)
api_router.include_router(gate_passes_router)
api_router.include_router(fee_structures_router)
api_router.include_router(resident_charges_router)
api_router.include_router(invoices_router)
api_router.include_router(payments_router)
api_router.include_router(expenses_router)
api_router.include_router(security_deposits_router)
api_router.include_router(complaints_router)
api_router.include_router(maintenance_tickets_router)
api_router.include_router(inventory_categories_router)
api_router.include_router(inventory_items_router)
api_router.include_router(assets_router)
api_router.include_router(asset_assignments_router)
api_router.include_router(mess_menus_router)
api_router.include_router(meals_router)
api_router.include_router(notices_router)
api_router.include_router(notifications_router)
api_router.include_router(audit_router)
api_router.include_router(reports_router)
# Further feature routers are registered here as the phases land.
