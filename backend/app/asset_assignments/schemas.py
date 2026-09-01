"""Asset assignment schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.exceptions import BadRequestError


class AssignmentCreate(BaseModel):
    asset_id: UUID
    resident_id: UUID | None = None
    staff_id: UUID | None = None
    room_id: UUID | None = None
    condition_on_assignment: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _target_required(self):
        if not any([self.resident_id, self.staff_id, self.room_id]):
            raise BadRequestError(
                "Assign to a resident, staff member, or room", code="assignment_target_required"
            )
        return self


class AssignmentReturn(BaseModel):
    condition_on_return: str | None = None
    notes: str | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    resident_id: UUID | None = None
    staff_id: UUID | None = None
    room_id: UUID | None = None
    assigned_at: datetime
    returned_at: datetime | None = None
    condition_on_assignment: str | None = None
    condition_on_return: str | None = None
    notes: str | None = None
    assigned_by: UUID | None = None


class AssignmentList(BaseModel):
    items: list[AssignmentOut]
    total: int
    page: int
    per_page: int
