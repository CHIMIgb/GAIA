# GAIA — Base de Datos (Históricos + Sesiones)

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.2  
> **Fecha:** 2026-09-24  

---

## 1. Propósito y Alcance

Definir el diseño de la base de datos de GAIA. Su **única responsabilidad** es:

1. **Persistir los datos históricos** obtenidos de las fuentes abiertas (incendios, sismos, viento, radiación, elevación) para que tanto los usuarios como el propio sistema puedan consultarlos cuando las APIs externas ya no los ofrezcan (ventanas históricas 24h/7d/30d y análisis posterior).
2. — *evaluado en §8* — **registrar metadatos de sesiones anónimas** (cookies), si se concluye que aporta valor frente a su costo de privacidad.

> [!IMPORTANT]
> La DB **no** es la fuente de datos en vivo: el pipeline en caliente sigue siendo Redis (TTLs cortos) → API externa. La DB es el **archivo histórico de abajo** en la cadena: cuando un usuario pide un rango pasado, se consulta la DB; el dato en vivo, cuando existe, siempre gana sobre el histórico.

### 1.1 Rol en la Arquitectura

```
  APIs externas ──► FastAPI ──► Redis (cache en vivo, TTL cortos)
                       │
                       │ ingest (job periódico, dedup)
                       ▼
              PostgreSQL + TimescaleDB (históricos)
                       ▲
                       │ consulta de rangos históricos (/api/history/*)
              FastAPI ──► Frontend (HUD)
```

---

## 2. Motor de Base de Datos

**PostgreSQL 18 con extensión TimescaleDB** (hipertablas serie temporal).

| Criterio              | PostgreSQL + TimescaleDB                          | Alternativa (no elegida) |
| --------------------- | ------------------------------------------------- | ------------------------ |
| Naturaleza de datos   | Series temporales de eventos geoespaciales        | MongoDB (documentos)     |
| Particionado por tiempo | Hipertablas automáticas (`time` como dimensión) | MySQL/particionado manual |
| Funciones geoespaciales | `PostGIS` integrable (opcional)                | —                        |
| Contención geográfica (flood/radiation) | B-tree + GIST en lat/lon                | —                        |
| Retención/borrado     | `drop_chunks` para purga por antigüedad (medidas de privacidad §8) | — |
| Madurez               | Operacional, soporte amplio, WAL + backup          | —                        |

> [!NOTE]
> El benchmark de carga es modesto (decenas a cientos de miles de eventos/día, no billones), pero TimescaleDB simplifica mucho el particionado temporal y la purga, que es exactamente el caso de uso "histórico + privacidad". Las imágenes oficiales de la comunidad (`timescale/timescaledb:latest-pg18`) cubren PostgreSQL 18; en entornos gestionados se usa el servicio equivalente (PG nativo + extensión).

---

## 3. Modelo de Datos

### 3.1 Diagrama Relacional

```
fire_hotspot
  ├─ PK id (identity)
  ├─ sensor_ts, lat, lon, brightness_k, frp_mw_km2
  ├─ instrument (VIIRS|MODIS), confidence, source
  └─ UQ (sensor_ts, lat, lon, instrument)  → dedup

earthquake
  ├─ PK id
  ├─ usgs_event_id (UQ)          → dedup por evento USGS
  ├─ time, lat, lon, depth_km, magnitude, place
  └─ ingested_at

wind_frame
  ├─ PK id
  ├─ sampled_at, resolution, u_component, v_component
  └─ payload_jsonb (muestras/resumen estadístico de la rejilla)

radiation_reading
  ├─ PK id
  ├─ station_id, lat, lon, value_usvh, raw_value, raw_unit
  ├─ alert_level (normal|elevated|critical)
  ├─ source (Safecast|EURDEP|RadNet|GMCMap)
  └─ UQ (station_id, sampled_at)  → últ.muestra por estación

elevation_sample
  ├─ PK id
  ├─ lat, lon, elevation_m
  └─ UQ (lat, lon)

data_ingestion_log          ← auditoría de la ingesta
  ├─ PK id
  ├─ module, source, status (ok|fallback|error), rows, ingested_at

session_events              ← §8 (evaluado)
  ├─ PK id
  ├─ session_hash (sha256, NO la cookie cruda)
  ├─ first_seen, last_seen, request_count
  ├─ user_agent_family, country_code (opcional, sin IP)
  └─ UNIQUE (session_hash)
```

### 3.2 DDL de Ejemplo

```sql
-- Incendios — hipertabla
CREATE TABLE fire_hotspot (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sensor_ts   TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    brightness_k NUMERIC(6,1),
    frp_mw_km2  NUMERIC(8,2),
    instrument  TEXT NOT NULL CHECK (instrument IN ('VIIRS','MODIS')),
    confidence  TEXT,
    source      TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sensor_ts, lat, lon, instrument)
);
SELECT create_hypertable('fire_hotspot', 'sensor_ts', migrate_data => true);

-- Sismos — dedup por evento USGS
CREATE TABLE earthquake (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usgs_event_id TEXT UNIQUE NOT NULL,
    time          TIMESTAMPTZ NOT NULL,
    lat           DOUBLE PRECISION NOT NULL,
    lon           DOUBLE PRECISION NOT NULL,
    depth_km      DOUBLE PRECISION,
    magnitude     DOUBLE PRECISION,
    place         TEXT,
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Radiación — una muestra por estación y timestamp
CREATE TABLE radiation_reading (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id   TEXT NOT NULL,
    sampled_at   TIMESTAMPTZ NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    value_usvh   DOUBLE PRECISION NOT NULL,
    raw_value    DOUBLE PRECISION,
    raw_unit     TEXT,
    alert_level  TEXT CHECK (alert_level IN ('normal','elevated','critical')),
    source       TEXT NOT NULL,
    UNIQUE (station_id, sampled_at)
);
```

---

## 4. Ingesta de Datos Históricos

### 4.1 Estrategia

- **Jobs periódicos** en el backend (aio-cron / scheduler interno o Job service externo) que tras actualizar caché Redis, **persisten los mismos datos** en la DB con **upsert por clave de dedup**.

```python
# backend/app/db/ingest.py (esquema)
async def ingest_hotspots(items: list[FireHotspot]):
    await db.execute(
        sa.insert(FireHotspot).values([row(**i) for i in items])
          .on_conflict_do_nothing(
              index_elements=["sensor_ts", "lat", "lon", "instrument"]
          )
    )
```

- **Frecuencia**: igual a los TTLs de Redis (incendios/sismos/radiación 5 min, viento 15 min) — se persiste lo que ya se ingirió en caliente, sin peticiones extras a las APIs.
- **Idempotencia**: las claves de dedup garantizan que re-persistir el mismo evento no duplica filas.

### 4.2 Volumen estimado (orden de magnitud)

> **Tabla canónica de retención.** Los días de retención por módulo viven aquí (única fuente de verdad); otros docs los referencian sin repetirlos (patrón del ROADMAP §1.1, criterio en AGENTS.md).

| Módulo      | Filas/día aprox. (alto tráfico) | Retención propuesta |
| ----------- | ------------------------------- | ------------------- |
| Incendios   | ~50,000                         | 90 días (bajo)     |
| Sismos      | ~1,000                          | 365 días            |
| Radiación   | ~20,000                         | 90 días (bajo)      |
| Viento      | 96 frames/día (JSONB)          | 30 días (pesado)     |
| Elevación   | bajo (punto a punto)            | 365 días            |

Se implementa **TTL físico** con `add_retention_policy('fire_hotspot', 90 * interval '1 day')` para que la DB no crezca indefinidamente.

---

## 5. API para Usuarios (Acceso a Históricos)

El usuario accede a los históricos con los mismos contratos que el resto de la app:

| Endpoint                     | Params                 | Fuente real                 |
| ---------------------------- | ---------------------- | --------------------------- |
| `GET /api/history/fires`     | `from`, `to`           | `fire_hotspot`              |
| `GET /api/history/quakes`    | `from`, `to`           | `earthquake`                |
| `GET /api/history/wind`      | `from`, `to`           | `wind_frame`                |
| `GET /api/history/radiation` | `from`, `to`, `bbox`   | `radiation_reading`         |
| `GET /api/history/elevation` | `lat`, `lon`, `from`, `to` | `elevation_sample`      |

Respuesta con el [contrato universal](./GAIA_API_CONTRACT.md): `{ success, data: { count, items }, error: null }`. El frontend lo consume igual que el feed en vivo; los módulos Three.js reciben el mismo `Float32Array` del worker (reutilizan todo el renderizado).

> [!TIP]
> Cuando el cliente pide un rango **reciente** (p.ej. últimas 24 h), el orquestador consulta primero Redis; si el rango se retrotrae más allá de los TTLs, entonces se consulta la DB. Así se mantiene la latencia < 20 ms en caliente y la DB solo absorbe el pasado.

---

## 6. Migraciones, Backups y Despliegue

### 6.1 Migraciones — Alembic

Versionado de esquema con **Alembic** (compatible SQLAlchemy). Toda tabla nueva pasa por una migración; CI la ejecuta contra una DB limpia en los tests de integración.

### 6.2 Backup y Recuperación

- **WAL archiving** + `pg_dump` diario (cron); restauración RPO ≤ 24 h, RTO ≤ 1 h.
- En contenedores: montar volumen PostgreSQL dedicado (`postgres-data`).
- Retención de backups acorde a la retención de datos (§4.2), ya que la DB acumula históricos y **datos de sesión** (§8).

### 6.3 `docker-compose.yml` (adición)

```yaml
  db:
    image: timescale/timescaledb:latest-pg18
    restart: unless-stopped
    environment:
      POSTGRES_DB: gaia
      POSTGRES_USER: gaia
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres-data:
```

### 6.4 Variables de Entorno (backend)

| Variable       | Default                | Uso                    |
| -------------- | ---------------------- | ---------------------- |
| `DATABASE_URL` | `postgresql+asyncpg://gaia:gaia@localhost:5432/gaia` | DSN SQLAlchemy (async/asyncpg) |
| `DB_PASSWORD`  | —                      | Secret del servicio    |
| `HISTORY_RETENTION_*` | 90/365 días    | TTL físico por tabla   |

---

## 7. Consideraciones de Rendimiento y Consultas

- **Índices**: `(lat, lon)` con GIST (PostGIS si se añaden bbox) y `time` como columna de partición de hipertabla.
- **Paginación**: `OFFSET/LIMIT` con orden `time DESC` (los rangos históricos suelen pedirse del más reciente al más antiguo).
- **Límites de volumen por respuesta**: un rango muy amplio se sirve muestreado (p. ej. máx. 20,000 puntos por respuesta, agrupado por hora) para no abrumar a los módulos GPU.
- **Caché**: las consultas históricas repetidas se cachean en Redis (`history:{module}:{range}`) con TTL corto — la DB no se consulta dos veces seguida.

---

## 8. Evaluación — ¿Mantener un Registro de Cookies de Sesión?

> Pregunta explícita del diseño: *¿es buena idea guardar las cookies de sesión para saber quién accede a la aplicación?*

### 8.1 Contexto

GAIA no tiene cuentas; las cookies son sesiones anónimas (§3 de Seguridad). "Saber quién accede" **_no_** significa identificar personas: la app no pide dato personal alguno.

### 8.2 Utilidad de los registros

| Beneficio                                  | Valor |
| ------------------------------------------ | ----- |
| Correlacionar requests de un mismo navegador para un rate-limit más justo (por-sesión, no solo por IP) | **Alto** |
| Métricas de uso agregadas (cuántos visitantes únicos/sesión, duración, módulos usados) sin identificar personas | **Alto** |
| Depuración de abuso/scraping (patrones de una sesión) | **Medio** |
| Auditoría de acceso (complementa `data_ingestion_log`) | **Bajo** |

### 8.3 Riesgos / costos

| Riesgo                                   | Severidad | Mitigación prevista |
| ---------------------------------------- | :-------: | ------------------- |
| Guardar la **cookie cruda** daría capacidad de "robo de sesión" a quien acceda a la DB | **Alta** | Guardar **solo `sha256(token)`**, nunca el valor |
| Riesgo de **reidentificación** indirecta (IP + user-agent + horario ≈ individuos) | Media     | No guardar IP; guardar solo `country_code` y `user_agent_family`  |
| Obligaciones **GDPR** (layout de datos, derecho de supresión) en una app que quería "sin cuentas" | Media     | Retención corta (30–90 días) + purga automática (TimescaleDB) |
| Ruido en los textos de privacidad (aviso de cookies) | Baja      | Aviso discreto en footer/HUD (§9 Seguridad) |

### 8.4 Veredicto y Decisión Recomendada

**Sí, es buena idea — pero solo como "registro de eventos de sesión anonimizados", y nunca como almacén de cookies.**

- ✅ **Mantener**: una tabla `session_events` que guarde, por sesión, solo el **hash** de la cookie, `first_seen/last_seen`, `request_count`, `user_agent_family` y `country_code`. Útil para rate-limit por sesión, métricas de uso y detección de abuso.
- ❌ **Descartar**: guardar el valor de la cookie, IPs completas, o cualquier intención de **identificar usuarios individuales**.

| Decisión                       | Detalle                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| ¿Guardar cookie cruda?         | **NO** — vulnerabilidad de suplantación si se filtra la DB    |
| ¿Guardar hash de sesión?       | **SÍ** — hash SHA-256, irreversible, sirve para correlación   |
| ¿Guardar IP?                   | **NO** — por privacidad; usar `country_code` (agregado)       |
| ¿Retención?                    | 30–90 días con purga automática diaria                        |
| ¿Objetivo?                     | Métricas de uso agregadas + rate-limit justo por sesión        |

```python
# backend/app/db/session_store.py (esquema)
import hashlib

def session_key(cookie_value: str) -> str:
    return hashlib.sha256(cookie_value.encode()).hexdigest()  # nunca el valor original

async def touch_session(req: Request, db):
    token = extract_session_cookie(req)
    if token:
        await db.execute(
            sa.insert(SessionEvent)
              .values(session_hash=session_key(token),
                      request_count=1)
              .on_conflict_do_update(
                  index_elements=["session_hash"],
                  set_={"last_seen": now(), "request_count": SessionEvent.request_count + 1}
              )
        )
```

> [!IMPORTANT]
> Esta decisión cierra el requisito de privacidad de [Seguridad §9](./GAIA_SECURITY.md): la aplicación puede afirmar que **no identifica usuarios** (no hay PII ni cuenta), solo cuenta sesiones anónimas agregadas con retención acotada.

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md), la [Guía de Despliegue](./GAIA_DEPLOYMENT.md) y la [Seguridad](./GAIA_SECURITY.md) del proyecto GAIA.*