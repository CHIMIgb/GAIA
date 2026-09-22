# GAIA — Seguridad de la Aplicación

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-22  

---

## 1. Propósito y Modelo de Amenazas

Definir los controles de seguridad de GAIA: rate limiting, protección contra DDoS, mitigación de XSS, manejo de sesiones por cookies (la app **no registra cuentas de usuario**) y endurecimiento general del frontend y backend.

### 1.1 Modelo de Amenazas

| Activo                       | Principal amenaza                                  | Vector            |
| ---------------------------- | -------------------------------------------------- | ----------------- |
| Backend FastAPI + Redis      | Abuso de cuota / DoS / scraping masivo             | Red (HTTP)        |
| Datos de fuentes externas    | Inyección de contenido malicioso (XSS)             | Upstream (JSON/CSV) |
| Sesiones anónimas (cookies)  | Robo/falsificación de la sesión, CSRF, tracking sin consentimiento | Navegador |
| Disponibilidad               | DDoS volumétrico / aplicación                       | Capa 3/4 y capa 7 |
| Dependencias                 | Vulnerabilidades de terceros                        | Supply chain      |

> [!NOTE]
> GAIA **no autentica usuarios** (no hay registro ni login). Las cookies sirven únicamente para **sesiones anónimas** de navegación (propósito §3 y §9): correlacionar peticiones, rate-limit por sesión y métricas agregadas. Esto simplifica el modelo: no hay cuentas que robar, pero sí que proteger en privacidad.

---

## 2. Principios de Seguridad

1. **Confianza cero en upstreams.** Todo dato externo (GeoJSON, CSV) se valida y normaliza en el backend (`pydantic`) y se **trata como no confiable** en el frontend.
2. **Defensa en profundidad.** Cada capa (CDN → Nginx → FastAPI → validación → HUD) aplica sus propios controles.
3. **Mínimo privilegio y datos mínimos.** Solo se recogen los datos estrictamente necesarios (Ley de minimización, GDPR).
4. **TLS en toda la comunicación.** HTTPS/HTTP2 en producción (véase [Guía de Despliegue](./GAIA_DEPLOYMENT.md)).
5. **Seguridad por defecto.** Headers estrictos, cookies `HttpOnly`/`Secure`, CORS con allowlist, cifrado en tránsito.

---

## 3. Sesiones por Cookie (sin cuentas de usuario)

### 3.1 Diseño de la Cookie

| Atributo            | Valor                    | Motivo                                   |
| ------------------- | ------------------------ | ---------------------------------------- |
| Nombre              | `gaia_session`           | Única cookie propia                     |
| Valor               | Token opaco de 256 bits (UUIDv4 aleatorio) | No contiene información del usuario |
| `HttpOnly`          | ✅                       | No accesible desde JS (mitiga robo por XSS) |
| `Secure`            | ✅ (producción)           | Solo via HTTPS                          |
| `SameSite`          | `Lax`                    | Bloquea envío en cross-site (CSRF)      |
| `Path`              | `/`                      | Aplica a toda la app                    |
| `Max-Age`           | 30 días                  | Sesión anónima persistente acotada; se renueva con uso |

```python
# backend/app/services/session.py (esquema)
def create_session_cookie(session_id: str) -> str:
    return f"gaia_session={session_id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000"
```

El valor de la cookie es un **token opaco**: el servidor guarda solo su **hash** (`sha256(token)`) en Redis con TTL 30 días, nunca el token en sí ni datos personales.

### 3.2 Por qué no hay CSRF token

Todas las mutaciones de estado de GAIA ocurren **en el cliente** (Valtio). El backend expone una API **solo lectura** (`GET /api/*`, `/health`). Con `SameSite=Lax` + `ReferrerPolicy`, el riesgo CSRF es despreciable porque no hay endpoints que muten datos en el servidor. Si en el futuro se añadiera escritura, se introduciría un token CSRF (`Double Submit`).

### 3.3 Frameo de referencia (registro de sesión)

La pregunta de si conviene **mantener un registro de cookies de sesión** se analiza en profundidad en [GAIA_DATABASE.md §8](./GAIA_DATABASE.md). Conclusión anticipada: **sí, pero con diseño de privacidad** (guardar solo hash + eventos, nunca la cookie cruda, retención corta y purga automática).

---

## 4. Rate Limiting

Se aplica en **dos niveles**: edge (CDN) y aplicación (FastAPI).

### 4.1 Aplicación — `slowapi` (FastAPI)

Algoritmo: **ventana deslizante por IP y por sesión** con almacén en Redis (token bucket). La clave incluye el prefijo del endpoint.

```python
# backend/app/middleware/rate_limit.py (esquema)
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, storage_uri=settings.REDIS_URL)

# Límite global por IP
@limiter.limit("120/min; burst=240")
async def root():
    ...

# Límites específicos por endpoint "pesado"
@app.get("/api/radiation")
@limiter.limit("30/min")                      # consulta por radio = costosa
async def get_radiation(request: Request, lat: float, lon: float, radius_km: int = 50):
    ...
```

| Endpoint               | Límite por IP | Límite por sesión | Nota                    |
| ---------------------- | :-----------: | :---------------: | ----------------------- |
| Global (todos `/api/*`) | 120/min (burst 240) | 60/min (burst 120) | Defensa base            |
| `/api/fires`           | 60/min        | 30/min            | Poll del HUD             |
| `/api/quakes`          | 60/min        | 30/min            |                          |
| `/api/wind`            | 30/min        | 15/min            | Payload binario grande   |
| `/api/radiation`       | 30/min        | 15/min            | Consulta geográfica costosa |
| `/api/elevation`       | 120/min       | 60/min            | Ligeras, ubicuas         |
| `/health`              | Exento        | Exento            | Para uptime checks       |

### 4.2 Respuesta `429` (contrato universal)

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UPSTREAM_RATE_LIMITED",
    "message": "Too many requests. Try again in 30 seconds.",
    "details": { "retry_after_seconds": 30 }
  }
}
```

Con cabeceras `Retry-After: 30` y `RateLimit-*` estándar. El frontend (Workflow 7) degrada al dataset de respaldo sin romper la experiencia.

### 4.3 Reglas

- Los límites **sí se aplican a los proxies de upstream**, porque el backend ya protege las cuotas de NASA/USGS/Open-Meteo; el rate-limit de GAIA evita que un mismo navegador/dispositivo multiplique esas cuotas.
- Almacenar contadores en Redis (no en memoria del proceso) para que el límite persista entre instancias/workers.

---

## 5. Protección contra DDoS

### 5.1 Capa de red / edge (recomendado en producción)

| Control | Implementación | Mitiga |
| ------- | -------------- | ------ |
| **CDN/Proxy** | Cloudflare (o similar) delante del frontend y backend | DDoS volumétrico (L3/L4), L7 floods leves |
| **Rate limit en edge** | Regla de zona/plan alternativo: > 300 req/min/IP en `/api/*` ⇒ `429` (interfaces específicas sobrescribibles) | Floods de aplicación |
| **WAF** | Reglas gestionadas (SQLi relleno, bot, scraping) | Ataques capa 7 |
| **Bot management** | JS challenge opcional, sin captcha por defecto (RNF-06: FCP < 2 s) | Scraping masivo |

### 5.2 Capa de aplicación / servidor

- **Nginx** (Opción B de despliegue): `limit_req` y `limit_conn` por IP; tamaño máximo de request **1 MB** (`client_max_body_size`); timeouts de proxy ≤ 5 s (alineados con el fallback de upstream).
- **Uvicorn bajo desgate**: ejecutar con multi-workers (o `--workers` detrás de un proxy) para no saturar un solo proceso.
- **Backpressure**: si Redis no responde, fallar **rápido** (`fail-fast`) en `slowapi` en lugar de encolar peticiones ilimitadas.
- **CORS con allowlist**: solo `CORS_ORIGINS` configurado (ver [Deployment §4](./GAIA_DEPLOYMENT.md)); ninguna origin `*` en producción.

### 5.3 Límites de recursos

| Recurso        | Límite            | Dónde           |
| -------------- | ----------------- | --------------- |
| Tamaño request | 1 MB              | Nginx / FastAPI |
| Timeout upstream | 5 s + 3 reintentos | `http_client.py` |
| Body JSON      | `max_body` 1 MB   | FastAPI         |
| Conexiones simultáneas | Nginx `limit_conn` 100/IP | Nginx |

> [!IMPORTANT]
> El balance entre protección DDoS y rendimiento: GAIA exige FCP < 2 s (RNF-06). Por eso el edge usa **challenge ligeros (JS challenge) en vez de CAPTCHA** y el rate-limit edge arranca alto (> 300 req/min) para no penalizar usuarios reales.

---

## 6. Protección XSS (y otro contenido inyectado)

### 6.1 Frontend (React)

- **React escapa por defecto** todo texto (`{variable}` → `textContent`). Prohibida `dangerouslySetInnerHTML` (regla de lint `react/no-danger`).
- **Sanitización de datos upstream**: los campos libres de las APIs (p.ej. `place: "Near Tokyo, Japan"`, `station_id`) se **tratan como texto no confiable**. Si algún día se renderiza HTML enriquecido, se sanitiza con `DOMPurify`:
  ```typescript
  const place = sanitizeDOM(quake.data.place); // DOMPurify — solo si se necesita HTML
  ```
- **Valores numéricos**: todo valor de telemetría se formatea tipado (`Intl.NumberFormat`); ningún dato crudo se concatena a HTML.
- **No evaluar dinámicamente**: prohibido `eval`/`new Function` con datos externos; los shaders GLSL son string estáticos del bundle, nunca se interpolan datos de usuario en tiempo de ejecución.

### 6.2 Headers de seguridad (backend + Nginx)

| Header                            | Valor                                      | Bloquea                         |
| --------------------------------- | ------------------------------------------ | ------------------------------- |
| `Content-Security-Policy`         | `default-src 'self'; script-src 'self' 'nonce-{n}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://server.arcgisonline.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'` | XSS por inyección de script/iframe |
| `Strict-Transport-Security`       | `max-age=31536000; includeSubDomains`      | Downgrade a HTTP / MITM        |
| `X-Content-Type-Options`          | `nosniff`                                  | MIME sniffing (ej. JSON→HTML)  |
| `X-Frame-Options`                 | `DENY`                                     | Clickjacking                    |
| `Referrer-Policy`                 | `strict-origin-when-cross-origin`          | Fuga de URL en referer         |
| `Permissions-Policy`              | `camera=(), microphone=(), geolocation=()` | API sensibles innecesarias     |

> [!NOTE]
> Webpack 5 inyecta el nonce CSP en el `index.html` generado (`html-webpack-plugin`), de modo que los scripts inline del HMR/build se permiten solo con nonce asociado al request.

### 6.3 Tests de seguridad

- **Frontend**: test que verifica que un `place` que contenga `<img onerror=...>` se renderiza como texto plano (sin ejecutar) — casos en `frontend/tests/security/xss.spec.tsx`.
- **Backend**: test de cabeceras de respuesta presentes (incluye CSP de prueba si el backend sirve HTML en `OPTIONS`/`404`).
- **CI**: ejecutar `npm audit` + `pip-audit` (incorpóralo al pipeline de [Deployment §6.3](./GAIA_DEPLOYMENT.md)).

---

## 7. Endurecimiento de la API y los Datos

| Riesgo                     | Control                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Parámetros inválidos       | Validación `pydantic` estricta (rangos de `hours`, `days`, `radius_km`) |
| Respuestas inconsistentes  | Middleware global que garantiza el contrato `{ success, data, error }`  |
| Payload de upstream malicioso | `pydantic` decodifica y **rechaza** campos fuera de schema (extra fields ignorados) |
| Inyección SQL              | Consultas **parametrizadas** (SQLAlchemy) — sin concatenación de strings |
| Logs con datos sensibles   | Se omiten cookies/IP completos del access log; se loguea el **hash** de sesión |

> [!CAUTION]
> El técnico crítico: **los datos de radiación** (`value_usvh`, `station_id`) y los feeds de sismos viajan de fuente externa a la UI. La validación de esquema en el backend (RF-13) es el primer filtro; el frontend **vuelve a tratar esos campos como texto/número**, no como HTML.

---

## 8. Seguridad de Dependencias (Supply Chain)

- **Lockfiles**: `package-lock.json` y `pip freeze` congelan versiones.
- **Auditorías automáticas en CI**: `npm audit --audit-level=high` y `pip-audit` bloquean el PR si hay vulnerabilidades conocidas (se agrega al pipeline de calidad).
- **Dependabot / Renovate**: PRs automáticos de actualización de dependencias.
- **Versiones objetivo** fijadas en [Deployment §8](./GAIA_DEPLOYMENT.md).
- **Imágenes Docker**: usar tags pinneados (`python:3.12-slim`, `redis:7-alpine`) y `--no-cache-dir`; escanear imágenes con `trivy` opcional.

---

## 9. Privacidad y Cumplimiento

Sin cuentas de usuario, la aplicación **no recolecta identidad personal** por diseño. Aun así:

- **Minimización**: la cookie solo contiene un token opaco; el servidor guarda el hash, no el valor.
- **Retención**: eventos de sesión limitados a **30–90 días** con purga automática (job diario).
- **Transparencia**: un aviso discreto en el HUD y en el footer sobre el uso de cookies de sesión anónima (análisis y rate-limit), suficiente para el caso "sin cuentas".
- **No tracking cross-site**: `SameSite=Lax` impide que la cookie viaje fuera del dominio.
- **Derechos**: dado que no se registran cuentas ni PII vinculable, no aplican flujos complejos de borrado de datos; la purga por retención cubre el principio de limitación del almacenamiento (GDPR art. 5.1.e).

---

## 10. Matriz de Verificación de Seguridad

| Amenaza              | Control principal                          | Verificación / Test                                       |
| -------------------- | ------------------------------------------ | --------------------------------------------------------- |
| Abuso de API / DoS   | rate-limit slowapi + límites Nginx          | Test de límite: 200 req/min → `429` con contrato          |
| DDoS volumétrico     | Cloudflare + `limit_req`/`limit_conn`       | Smoke de rendimiento bajo throttling (Testing §2.3)      |
| XSS                  | React escaping + CSP + proib. `dangerouslySetInnerHTML` | `xss.spec.tsx` + header check en CI          |
| Robo de sesión       | Cookie `HttpOnly`/`Secure`/`SameSite` + token opaco | Audit de atributos de `Set-Cookie`              |
| CSRF                 | API solo lectura + `SameSite=Lax`           | Revisión: cero endpoints de escritura                     |
| Inyección SQL        | SQLAlchemy parametrizado                    | Revisión de código                                        |
| Supply chain         | `npm audit` / `pip-audit` en CI + lockfiles | CI bloquea con severity ≥ high                            |
| Headers               | CSP/HSTS/nosniff configurados              | Test de cabeceras en CI                                   |

---

*Este documento complementa la [Guía de Despliegue](./GAIA_DEPLOYMENT.md), el [Contrato de API](./GAIA_API_CONTRACT.md) y la [Base de Datos](./GAIA_DATABASE.md) del proyecto GAIA.*