"""Unit tests for the human-readable RequestValidationError messages built by
app.core.exceptions._validation_error_message. Real Pydantic models are used
to produce real v2 error shapes (loc/type/msg/ctx); no HTTP layer or database
is involved — RequestValidationError.errors() has the same shape as
pydantic.ValidationError.errors() (FastAPI just prefixes loc with "body").
"""

from __future__ import annotations

import pydantic
import pytest

from app.core.exceptions import _validation_error_message
from app.users.schemas import UserCreate

_VALID_ROLE_ID = "11111111-1111-1111-1111-111111111111"


class _AmountProbe(pydantic.BaseModel):
    amount: int


def test_missing_required_field_names_the_field_not_a_generic_message():
    with pytest.raises(pydantic.ValidationError) as exc_info:
        UserCreate.model_validate({})

    message = _validation_error_message(exc_info.value.errors())

    assert message == "Email is required"
    assert "loc" not in message.lower()
    assert "body" not in message.lower()
    assert "field required" not in message.lower()


def test_invalid_number_names_the_field_and_expected_type():
    with pytest.raises(pydantic.ValidationError) as exc_info:
        _AmountProbe.model_validate({"amount": "not-a-number"})

    message = _validation_error_message(exc_info.value.errors())

    assert message == "Amount must be a valid number"


def test_message_never_includes_the_submitted_input_value():
    with pytest.raises(pydantic.ValidationError) as exc_info:
        _AmountProbe.model_validate({"amount": "super-secret-value-12345"})

    message = _validation_error_message(exc_info.value.errors())

    assert "super-secret-value-12345" not in message


def test_password_policy_message_strips_the_pydantic_value_error_prefix():
    with pytest.raises(pydantic.ValidationError) as exc_info:
        UserCreate.model_validate(
            {
                "email": "a@example.com",
                "first_name": "Ada",
                "role_id": _VALID_ROLE_ID,
                "password": "abcdefg1",  # has a digit, but no special character
            }
        )

    message = _validation_error_message(exc_info.value.errors())

    assert message == "Password must contain at least one special character"
    assert "value error" not in message.lower()


def test_empty_errors_list_falls_back_to_generic_message():
    assert _validation_error_message([]) == "Request validation failed"
