"""Contrato universal `{success, data, error}`.

Fuente de verdad: docs/GAIA_API_CONTRACT.md §2, §5.1 y §6 (catálogo de 7 códigos).
"""

from enum import StrEnum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel


class ErrorCode(StrEnum):
    """Códigos de error del catálogo (API_CONTRACT §6)."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE"
    UPSTREAM_RATE_LIMITED = "UPSTREAM_RATE_LIMITED"
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT"
    CACHE_MISS = "CACHE_MISS"
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR"


CODE_BY_STATUS: dict[int, ErrorCode] = {
    400: ErrorCode.VALIDATION_ERROR,
    404: ErrorCode.NOT_FOUND,
    429: ErrorCode.UPSTREAM_RATE_LIMITED,
    500: ErrorCode.INTERNAL_SERVER_ERROR,
    502: ErrorCode.UPSTREAM_UNAVAILABLE,
    503: ErrorCode.CACHE_MISS,
    504: ErrorCode.UPSTREAM_TIMEOUT,
}


class APIError(BaseModel):
    code: ErrorCode
    message: str
    details: Any = None


T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: APIError | None = None

    @classmethod
    def ok(cls, data: T) -> "APIResponse[T]":
        return cls(success=True, data=data, error=None)

    @classmethod
    def fail(
        cls, code: ErrorCode, message: str, details: Any = None
    ) -> "APIResponse[Any]":
        return cls(
            success=False,
            data=None,
            error=APIError(code=code, message=message, details=details),
        )
