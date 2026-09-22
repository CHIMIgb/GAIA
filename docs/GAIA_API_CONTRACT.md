# GAIA — Contrato Universal de Comunicación API

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.1  
> **Fecha:** 2026-09-21  

---

## 1. Propósito

Este documento define el **formato de contrato universal** para toda comunicación entre el frontend (TypeScript) y el backend (FastAPI). Todas las respuestas HTTP del backend — sin excepción — deben respetar esta estructura.

---

## 2. Estructura del Contrato

```json
{
  "success": true,
  "data": { },
  "error": null
}
```

### Definición Formal

| Campo              | Tipo                    | Obligatorio | Descripción                                                                 |
| ------------------ | ----------------------- | :---------: | --------------------------------------------------------------------------- |
| `success`          | `boolean`               | ✅          | `true` si la operación fue exitosa, `false` si ocurrió un error.            |
| `data`             | `object \| array \| null` | ✅        | Payload de la respuesta. `null` cuando `success` es `false`.                |
| `error`            | `object \| null`        | ✅          | Objeto de error. `null` cuando `success` es `true`.                         |
| `error.code`       | `string`                | ✅*         | Código de error legible por máquina (ej: `"FIRMS_RATE_LIMITED"`).           |
| `error.message`    | `string`                | ✅*         | Mensaje de error legible por humanos.                                       |
| `error.details`    | `any`                   | ❌          | Información adicional de depuración (trazas, campos inválidos, etc.).       |

> \* Obligatorio cuando `success` es `false`.

---

## 3. Reglas del Contrato

### 3.1 Exclusividad Mutua

`data` y `error` son **mutuamente excluyentes**. Nunca deben estar poblados simultáneamente:

| `success` | `data`       | `error`      |
| :-------: | :----------: | :----------: |
| `true`    | Poblado      | `null`       |
| `false`   | `null`       | Poblado      |

### 3.2 Consistencia Absoluta

- **Toda** ruta del backend debe retornar este formato, incluyendo endpoints de salud (`/api/health`), metadata y errores de validación.
- Los errores de servidor no controlados (500) también deben ser capturados por un middleware global y envueltos en este formato.

### 3.3 Códigos HTTP + Contrato

El contrato **no reemplaza** los códigos de estado HTTP, los **complementa**:

| Escenario                   | HTTP Status | `success` | `error.code`             |
| --------------------------- | :---------: | :-------: | ------------------------ |
| Datos entregados con éxito  | `200`       | `true`    | —                        |
| Recurso creado              | `201`       | `true`    | —                        |
| Sin datos (consulta vacía)  | `200`       | `true`    | — (`data` = `[]` o `{}`) |
| Parámetros inválidos        | `400`       | `false`   | `VALIDATION_ERROR`       |
| API externa sin respuesta   | `502`       | `false`   | `UPSTREAM_UNAVAILABLE`   |
| Rate-limit de API externa   | `429`       | `false`   | `UPSTREAM_RATE_LIMITED`  |
| Error interno del servidor  | `500`       | `false`   | `INTERNAL_SERVER_ERROR`  |

---

## 4. Ejemplos por Endpoint

### 4.1 Éxito — Incendios (NASA FIRMS)

**`GET /api/fires?hours=24`** → `200 OK`

```json
{
  "success": true,
  "data": {
    "count": 1842,
    "source": "NASA_FIRMS_VIIRS",
    "cached": true,
    "items": [
      {
        "lat": -12.453,
        "lon": -54.321,
        "brightness": 342.5,
        "frp": 28.7,
        "instrument": "VIIRS",
        "confidence": "high",
        "acq_date": "2026-09-21T14:30:00Z"
      }
    ]
  },
  "error": null
}
```

### 4.2 Éxito — Sismos (USGS)

**`GET /api/earthquakes?days=7&min_magnitude=4.0`** → `200 OK`

```json
{
  "success": true,
  "data": {
    "count": 37,
    "source": "USGS_GeoJSON",
    "items": [
      {
        "lat": 35.67,
        "lon": 139.72,
        "depth_km": 42.3,
        "magnitude": 5.1,
        "place": "Near Tokyo, Japan",
        "time": "2026-09-20T08:14:22Z"
      }
    ]
  },
  "error": null
}
```

### 4.3 Éxito — Viento (Open-Meteo)

**`GET /api/wind?resolution=1deg`** → `200 OK`

```json
{
  "success": true,
  "data": {
    "grid_size": [360, 181],
    "source": "OPEN_METEO",
    "format": "binary",
    "u_component_url": "/api/wind/binary/u",
    "v_component_url": "/api/wind/binary/v"
  },
  "error": null
}
```

### 4.4 Error — API externa no disponible

**`GET /api/fires?hours=24`** → `502 Bad Gateway`

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "NASA FIRMS API is not responding. Serving cached data if available.",
    "details": {
      "upstream_url": "https://firms.modaps.eosdis.nasa.gov/api/...",
      "timeout_ms": 5000,
      "retries_attempted": 3
    }
  }
}
```

### 4.5 Error — Parámetros inválidos

**`GET /api/earthquakes?days=400`** → `400 Bad Request`

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Parameter 'days' must be between 1 and 30.",
    "details": {
      "field": "days",
      "received": 400,
      "allowed_range": [1, 30]
    }
  }
}
```

### 4.6 Error — Rate limit

**`GET /api/fires?hours=24`** → `429 Too Many Requests`

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UPSTREAM_RATE_LIMITED",
    "message": "NASA FIRMS API rate limit exceeded. Try again in 60 seconds.",
    "details": {
      "retry_after_seconds": 60,
      "fallback_available": true
    }
  }
}
```

### 4.7 Éxito — Radiación Ambiental (Safecast / EURDEP)

**`GET /api/radiation?lat=35.6762&lon=139.6503&radius_km=50`** → `200 OK`

```json
{
  "success": true,
  "data": {
    "count": 128,
    "source": "SAFECAST_OSINT",
    "cached": true,
    "unit_standard": "uSv/h",
    "items": [
      {
        "lat": 35.6762,
        "lon": 139.6503,
        "value_usvh": 0.142,
        "raw_value": 42.0,
        "raw_unit": "CPM",
        "station_id": "sf_tokyo_09",
        "alert_level": "normal",
        "timestamp": "2026-09-21T18:20:00Z"
      },
      {
        "lat": 37.4211,
        "lon": 141.0312,
        "value_usvh": 1.250,
        "raw_value": 1.250,
        "raw_unit": "uSv/h",
        "station_id": "sf_fukushima_02",
        "alert_level": "critical",
        "timestamp": "2026-09-21T18:22:10Z"
      }
    ]
  },
  "error": null
}
```

---

## 5. Implementación

### 5.1 Backend (FastAPI / Python)

```python
from pydantic import BaseModel
from typing import Any, Optional


class APIError(BaseModel):
    code: str
    message: str
    details: Any = None


class APIResponse(BaseModel):
    success: bool
    data: Any = None
    error: Optional[APIError] = None

    @classmethod
    def ok(cls, data: Any) -> "APIResponse":
        return cls(success=True, data=data, error=None)

    @classmethod
    def fail(cls, code: str, message: str, details: Any = None) -> "APIResponse":
        return cls(
            success=False,
            data=None,
            error=APIError(code=code, message=message, details=details),
        )


# --- Uso en endpoints ---

@app.get("/api/fires")
async def get_fires(hours: int = 24) -> APIResponse:
    try:
        items = await fetch_firms(hours)
        return APIResponse.ok({"count": len(items), "items": items})
    except UpstreamUnavailable as e:
        return APIResponse.fail(
            code="UPSTREAM_UNAVAILABLE",
            message="NASA FIRMS API is not responding.",
            details={"timeout_ms": e.timeout},
        )
```

### 5.2 Middleware Global de Errores (FastAPI)

```python
from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=APIResponse.fail(
            code="INTERNAL_SERVER_ERROR",
            message="An unexpected error occurred.",
            details=str(exc) if DEBUG else None,
        ).model_dump(),
    )
```

### 5.3 Frontend (TypeScript)

```typescript
// types/api.ts

interface APIError {
  code: string;
  message: string;
  details?: any;
}

interface APIResponse<T = any> {
  success: boolean;
  data: T | null;
  error: APIError | null;
}

// utils/api.ts

async function fetchAPI<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json: APIResponse<T> = await res.json();

  if (!json.success) {
    throw new GaiaAPIError(json.error!);
  }

  return json.data!;
}

// Uso:
const fires = await fetchAPI<FiresPayload>('/api/fires?hours=24');
```

---

## 6. Catálogo de Códigos de Error

| Código                    | HTTP | Descripción                                        |
| ------------------------- | :--: | -------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Parámetros de entrada inválidos o fuera de rango.  |
| `NOT_FOUND`               | 404  | Recurso no encontrado.                             |
| `UPSTREAM_UNAVAILABLE`    | 502  | API externa (NASA, USGS, Open-Meteo) sin respuesta.|
| `UPSTREAM_RATE_LIMITED`   | 429  | Cuota de API externa agotada.                      |
| `UPSTREAM_TIMEOUT`        | 504  | Timeout esperando respuesta de API externa.        |
| `CACHE_MISS`              | 503  | Sin datos en caché y API externa no disponible.    |
| `INTERNAL_SERVER_ERROR`   | 500  | Error inesperado del servidor.                     |

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md) y el [Stack Tecnológico](./GAIA_TECH_STACK.md) del proyecto GAIA.*
