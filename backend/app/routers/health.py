"""GET /api/health — estado del servidor.

El payload se amplía con el estado de Redis en el Paso 0.2.2 (cliente Redis async);
el Criterio de 0.2.1 solo exige `data.ok`.
"""

from fastapi import APIRouter

from app.models.response import APIResponse

router = APIRouter()


@router.get("/health", response_model=APIResponse[dict[str, bool]])
async def health() -> APIResponse[dict[str, bool]]:
    return APIResponse.ok({"ok": True})
