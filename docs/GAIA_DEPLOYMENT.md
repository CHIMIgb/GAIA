# GAIA — Guía de Despliegue

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.3  
> **Fecha:** 2026-09-23  

---

## 1. Propósito

Documentar cómo se construye, despliega y opera GAIA en distintos entornos (desarrollo local, staging, producción), incluyendo la infraestructura, los servicios necesarios y las variables de configuración.

El despliegue contempla **tres piezas** que se orquestan de forma independiente:

| Pieza        | Stack                          | Despliegue                   |
| ------------ | ------------------------------ | ---------------------------- |
| **Frontend** | Build estático (Vite)             | Vercel / Netlify / Nginx CDN |
| **Backend**  | FastAPI + Uvicorn              | Railway / Render / Docker VPS |
| **Datos**    | Redis (caché) + PostgreSQL 18 / TimescaleDB (históricos) | Docker / Redis Cloud |

---

## 2. Arquitectura de Despliegue

```
                       ┌────────────────────────────────────────────┐
   Usuario ──HTTPS───► │                CDN / Frontend              │  (Vercel · Netlify · Nginx)
                       │  assets estáticos · JS · GLSL · texturas   │
                       └──────────────────────┬─────────────────────┘
                                              │  HTTPS (CORS)
                                              ▼
                       ┌────────────────────────────────────────────┐
                       │              Backend FastAPI              │  (Railway · Render · VPS)
                       │  /api/fires · /api/earthquakes · /api/wind
                       │  /api/history/* — desde PostgreSQL 18     │
                       │  /api/radiation · /api/elevation · /api/health│
                       └──────────────┬─────────────┬───────────────┘
                                      │             │  Redis (caché)
                                      ▼             ▼
                        ┌─────────────────────┐  ┌──────────────────────┐
                        │  APIs externas      │  │  Redis               │  (Redis Cloud · Docker)
                        │  NASA · USGS ·      │  │  firms / usgs / wind │
                        │  Open-Meteo ·       │  │  rad / elev (TTLs)   │
                        │  Safecast · EURDEP  │  └──────────────────────┘
                        └─────────────────────┘
```

Flujo de datos: el frontend consume exclusivamente `/api/*` del backend; el backend aísla rate-limits, CORS y fallbacks de las APIs externas (Workflow 7), y Redis amortigua la latencia (< 20 ms en caché hit).

---

## 3. Desarrollo Local

### 3.1 Requisitos Previos

| Herramienta          | Versión mínima | Uso                          |
| -------------------- | -------------- | ---------------------------- |
| Node.js              | 22 LTS         | Vite (dev server + build), Vitest |
| Python               | 3.12           | FastAPI, Uvicorn, tests      |
| Redis                | 7.x            | Caché (o Docker)             |
| Docker               | 24+            | Opcional (Redis + backend)   |
| Git                  | —              | Clonar el repositorio        |

### 3.2 Levantar el Entorno

```bash
# 1) Backend + Redis con Docker (opción rápida)
docker compose up -d              # levanta redis (7-alpine) + backend (:8000)

# 2) O solo Redis local (y backend nativo)
docker run -d --rm -p 6379:6379 --name gaia-redis redis:7-alpine

# 3) Backend nativo
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # editar variables (sección 4)
uvicorn app.main:app --reload --port 8000

# 4) Frontend (otro terminal)
cd frontend
npm install
cp .env.example .env.local        # editar variables (sección 4)
npm run dev                       # Vite dev server + HMR
```

> [!NOTE]
> **Hot reload de shaders GLSL:** Vite con `?raw`/`vite-plugin-glsl` recarga los `.vert`/`.frag` en caliente. Al editar un shader, el HMR recompila el módulo y Three.js reutiliza el material sin recargar el canvas.

### 3.3 Verificación Rápida

```bash
curl http://localhost:8000/api/health
# {"success": true, "data": {"status": "ok", "redis": "connected", ...}, "error": null}

curl 'http://localhost:8000/api/fires?hours=24'   # contrato universal
```

---

## 4. Variables de Entorno

### 4.1 Backend

| Variable            | Obligatoria | Default   | Descripción                                                     |
| ------------------- | :---------: | --------- | --------------------------------------------------------------- |
| `REDIS_URL`         | ✅          | `redis://localhost:6379/0` | DSN de Redis (asyncio).         |
| `DATABASE_URL`      | ✅          | `postgresql+asyncpg://gaia:gaia@localhost:5432/gaia` | DSN SQLAlchemy async (asyncpg) para históricos. |
| `DB_PASSWORD`       | ❌          | —         | Password de PostgreSQL cuando el DSN se compone por variables. |
| `FIRMS_MAP_KEY`     | ❌          | —         | API Key de NASA FIRMS. Sin ella, Fuego cae a modo fallback local. |
| `CORS_ORIGINS`      | ✅          | `http://localhost:8080` | Orígenes permitidos (separados por coma) para el frontend. |
| `DEBUG`             | ❌          | `false`   | Activa detalles en `INTERNAL_SERVER_ERROR` y logs verbose.       |
| `LOG_LEVEL`         | ❌          | `INFO`    | Nivel de logging Uvicorn/FastAPI.                                |
| `PORT`              | ❌          | `8000`    | Puerto de Uvicorn (usado por el contenedor).                     |
| `PUBLIC_FRONTEND_URL` | ✅        | —         | URL pública del frontend (para CORS en producción y métricas).   |

### 4.2 TTLs de Caché por Módulo (configurables)

| Módulo     | Clave patrón            | TTL     | Variable              | Default |
| ---------- | ----------------------- | :-----: | --------------------- | :-----: |
| Incendios  | `firms:{hours}h`        | 5 min   | `TTL_FIRES_SECONDS`   | `300`   |
| Sismos     | `usgs:{days}d:{mag}`    | 5 min   | `TTL_QUAKES_SECONDS`  | `300`   |
| Viento     | `wind:{resolution}`     | 15 min  | `TTL_WIND_SECONDS`    | `900`   |
| Radiación  | `rad:{lat}:{lon}:{km}`  | 5 min   | `TTL_RADIATION_SECONDS` | `300` |
| Elevación  | `elev:{lat}:{lon}`      | 5 min   | `TTL_ELEVATION_SECONDS` | `300`  |

> Los TTLs viven en `backend/app/cache/cache_keys.py`; las variables los sobreescriben sin recompilar.

### 4.3 Frontend (`.env.local`)

| Variable              | Uso                                         |
| --------------------- | ------------------------------------------- |
| `VITE_GAIA_API_BASE_URL` | Base del backend. Dev: `http://localhost:8000`. Vite expone al cliente solo las variables `VITE_*` (`import.meta.env`). |
| `VITE_GAIA_PUBLIC_URL`     | URL pública/base de la app (`build.base` de Vite). |
| `MAPBOX_ACCESS_TOKEN` | **Opcional alt.** Si se sustituyera Esri por tiles Mapbox. |

### 4.4 Plantilla `.env.example`

```bash
# ---- Backend ----
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql+asyncpg://gaia:gaia@localhost:5432/gaia
FIRMS_MAP_KEY=
CORS_ORIGINS=http://localhost:8080
DEBUG=false
LOG_LEVEL=INFO
PORT=8000
PUBLIC_FRONTEND_URL=http://localhost:8080

# ---- TTLs ----
TTL_FIRES_SECONDS=300
TTL_QUAKES_SECONDS=300
TTL_WIND_SECONDS=900
TTL_RADIATION_SECONDS=300
TTL_ELEVATION_SECONDS=300

# ---- Frontend (copiar a .env.local) ----
VITE_GAIA_API_BASE_URL=http://localhost:8000
```

> [!CAUTION]
> Nunca commitear `.env` ni `.env.local` con claves reales. `FIRMS_MAP_KEY` se inyecta en el entorno de despliegue (secrets del provider / GitHub Actions), no en el repo.

---

## 5. Build de Producción

### 5.1 Frontend

```bash
cd frontend
npm run build          # vite build (build.prod en vite.config.ts)
```

Optimizaciones de Vite (Rollup) habilitadas en `vite.config.ts` (build):

| Optimización | Detalle                                                              |
| ------------ | -------------------------------------------------------------------- |
| Tree-shaking | Eliminación de exports no usados de Three.js y React (esbuild/Rollup). |
| Code splitting | `build.rollupOptions.output.manualChunks`: chunk de arranque, chunk Three.js (bajo demanda) y chunk de React. |
| Minificación de shaders | GLSL minificado durante el build vía `vite-plugin-glsl`. |
| Source maps | `build.sourcemap: 'hidden'` con `minify: 'esbuild'` para origen (non-full). |
| Hashes deterministas | `chunkFileNames` con hash de contenido para caché HTTP estable de chunks. |

**Presupuesto de bundle** (verificado en CI con `size-limit`; ver [Plan de Testing](./GAIA_TESTING.md)):

| Asset          | Tamaño objetivo (gzip) |
| -------------- | ---------------------- |
| JS inicial total | ≤ 450 KB            |
| Chunk arranque  | ≤ 180 KB              |
| Chunk Three.js  | ≤ 250 KB              |

### 5.2 Backend — Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 5.3 Orquestación — `docker-compose.yml`

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"

  db:
    image: timescale/timescaledb:latest-pg18
    restart: unless-stopped
    environment:
      POSTGRES_DB: gaia
      POSTGRES_USER: gaia
      POSTGRES_PASSWORD: ${DB_PASSWORD:-gaia}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    environment:
      REDIS_URL: redis://redis:6379/0
      DATABASE_URL: postgresql+asyncpg://gaia:${DB_PASSWORD:-gaia}@db:5432/gaia
    depends_on:
      - redis
      - db
    ports:
      - "8000:8000"

volumes:
  redis-data:
  postgres-data:
```

---

## 6. Despliegue en Producción

### 6.1 Opción A — PaaS (Vercel/Netlify + Railway/Render)

| Pieza       | Proveedor            | Configuración clave                                              |
| ----------- | -------------------- | ---------------------------------------------------------------- |
| **Frontend**| Vercel / Netlify     | Build: `npm run build`; output: `frontend/dist`. Env: `VITE_GAIA_API_BASE_URL`. |
| **Backend** | Railway / Render     | Build: Dockerfile; env del §4.1 (secrets para `FIRMS_MAP_KEY`).  |
| **Redis**   | Redis Cloud / Upstash| `REDIS_URL` apuntando al servicio gestionado.                     |

Pasos:
1. Subir `backend/` a Railway/Render como servicio Docker (comando `uvicorn app.main:app ...`).
2. Conectar Redis gestionado y fijar `REDIS_URL`.
3. Conectar el repo frontend a Vercel/Netlify: `VITE_GAIA_API_BASE_URL` = URL pública del backend; `CORS_ORIGINS` en el backend debe incluir la URL del frontend.
4. Desplegar. Verificar `/api/health` y una request a `/api/fires`.

### 6.2 Opción B — Docker Compose en VPS

Recomendada para control total (DigitalOcean / Hetzner / Linode):

> [!NOTE]
> **Web Workers:** la comunicación entre hilos usa **Transferable Objects** (sin copia). No se usa `SharedArrayBuffer`, por lo que **no** se requieren los headers `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` — evita restricciones sobre recursos cross-origin (teselas, APIs externas).

```
[Internet] ──► Nginx :443 (HTTPS/TLS) ──► frontend estático (volumen)
                              │
                              └──► /api/* → backend:8000 (docker network)
                                             └──► redis:6379
```

```nginx
# /etc/nginx/sites-available/gaia
server {
    listen 80;
    server_name gaia.example.com;
    return 301 https://$host$request_uri;   # redirige a TLS
}

server {
    listen 443 ssl http2;
    server_name gaia.example.com;

    ssl_certificate     /etc/letsencrypt/live/gaia.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gaia.example.com/privkey.pem;

    root /var/www/gaia;                     # output de npm run build
    index index.html;
    try_files $uri $uri/ /index.html;       # SPA fallback

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**HTTPS / TLS** (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d gaia.example.com      # emite + renueva automáticamente
```

**Despliegue**:
```bash
docker compose up -d --build        # backend + redis
sudo rsync -a frontend/dist/ /var/www/gaia/
```

### 6.3 CI/CD — GitHub Actions

Flujo alineado con el [Plan de Testing](./GAIA_TESTING.md) (pasos 1–6 en los checks de calidad):

```yaml
# .github/workflows/ci.yml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: actions/setup-python@v5
        with: { python-version: 3.12 }
      - name: Lint + Typecheck
        working-directory: frontend
        run: npm ci && npm run lint
      - name: Tests frontend
        working-directory: frontend
        run: npx vitest run
      - name: Tests backend
        working-directory: backend
        run: pip install -r requirements.txt && pytest tests -q
      - name: Budget + draw calls
        working-directory: frontend
        run: npm run perf:check          # size-limit + assert drawCalls ≤ 8
      - name: Lighthouse (FCP < 2s)
        working-directory: frontend
        run: npm run lighthouse:ci
      - name: Smoke E2E (4 browsers)
        working-directory: frontend
        run: npx playwright test

  deploy:
    needs: quality
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Build frontend
        run: npm ci && npm run build
      - name: Deploy a Vercel/Netlify
        run: npx vercel --prod --yes      # o netlify deploy --prod
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

> [!IMPORTANT]
> Los checks de rendimiento (budget, draw calls, Lighthouse) se ejecutan **antes** del deploy. Una regresión de FCP o bundle **bloquea** el pase a producción.

---

## 7. Monitoreo y Operaciones

### 7.1 Health Check

`GET /api/health` (contrato universal de [GAIA_API_CONTRACT](./GAIA_API_CONTRACT.md)):

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "redis": "connected",
    "upstreams": {
      "firms": "ok",
      "usgs": "ok",
      "open_meteo": "ok",
      "radiation": "degraded"
    },
    "last_cache": { "hit_rate": 0.87 }
  },
  "error": null
}
```

Uso: configurar un **uptime check** (UptimeRobot / Vercel Cron / systemd timer) sobre `/api/health` que alerte cuando `status != ok` o `redis != connected`.

### 7.2 Logging Estructurado

- **Uvicorn/FastAPI**: logs JSON de acceso y errores con `request_id`.
- **Errores de upstream**: se registran con el `error.code` del contrato (`UPSTREAM_TIMEOUT`, `UPSTREAM_RATE_LIMITED`, etc.) para correlacionar con las alertas.
- Logs rotativos alojados fuera del contenedor (`/var/log/gaia/`) o en el proveedor gestionado (Railway/Render lo incluyen).

### 7.3 Métricas de Caché Redis

| Métrica          | Origen                              | Señal de alarma              |
| ---------------- | ----------------------------------- | ---------------------------- |
| **Hit rate**     | `INFO commandstats` + conteo propio | < 0.6 sostenido ⇒ revisar TTLs |
| **TTL expirados**| `SCAN` + `TTL` de claves patrón      | Expiración masiva ⇒ rate-limit upstream |
| **Latency P95**  | `SLOWLOG` / timing en `/api/health`      | > 50 ms con hit ⇒ red/buffer |

### 7.4 Alertas

| Alerta                          | Umbral                                        | Acción                                   |
| ------------------------------- | --------------------------------------------- | ---------------------------------------- |
| API externa caída sostenida     | 3+ fallos consecutivos en 10 min              | Revisar fixture/rate-limit; verificar fallback activo |
| Redis desconectado              | `/api/health` → `redis != connected`              | Reiniciar/ampliar instancia Redis        |
| FPS degradado (informativos)    | Reporte del perf job nightly < 45 FPS         | Revisar draw calls y uso de VRAM         |
| Disk/CPU del VPS                | CPU > 80 % / disk > 85 % (30 min)             | Escalar droplet/instancia                |

---

## 8. Versiones del Stack

Versiones **objetivo** a fijar en `package.json` y `requirements.txt`. Las revisiones menores exactas quedan congeladas en el lockfile (`package-lock.json` / `pip freeze`) al primer `npm ci`/`pip install`.

### 8.1 Frontend

| Dependencia          | Versión objetivo | Nota                                        |
| -------------------- | ---------------- | ------------------------------------------- |
| `three`              | `^0.170.0`       | Motor WebGL 2.0                             |
| `react`              | `^19.0.0`        | HUD (DOM overlay)                           |
| `react-dom`          | `^19.0.0`        | `createRoot` para el overlay                |
| `valtio`             | `^1.13.2`        | Estado Proxy-based (React + Three.js)       |
| `comlink`            | `^4.4.1`         | Workers tipados                             |
| `tailwindcss`        | `^3.4.10`        | Tema oscuro del HUD (config `3.x`)          |
| `typescript`         | `^5.6.2`         | strict mode                                 |
| `vite`               | `^6.0.0`         | Bundler + dev server (esbuild/Rollup)     |
| `@vitejs/plugin-react` | `^4.3.0`      | HMR y Fast Refresh para React             |
| `vite-plugin-glsl`   | `^1.3.0`         | Imports `?raw` de shaders GLSL             |
| `rollup-plugin-visualizer` | `^5.12.0` | Reporte del bundle (chunks)               |
| `stats.js`           | `^0.17.0`        | Overlay de FPS (debug)                      |

### 8.2 Backend

| Dependencia        | Versión objetivo | Nota                                          |
| ------------------ | ---------------- | --------------------------------------------- |
| `fastapi`          | `^0.115.0`       | Framework asíncrono                           |
| `uvicorn[standard]`| `^0.30.6`        | Servidor ASGI                                 |
| `pydantic`         | `^2.9.2`         | Modelos de request/response                   |
| `sqlalchemy[asyncio]` | (según lockfile)  | ORM asíncrono (asyncpg) para la DB de históricos |
| `asyncpg`          | (según lockfile)   | Driver PostgreSQL 18 (pool async)             |
| `alembic`          | (según lockfile)   | Migraciones de esquema de la DB               |
| `httpx`            | `^0.27.2`        | Cliente HTTP asíncrono (upstreams)            |
| `redis`            | `^5.0.7`         | Cliente Redis asyncio (`redis>=5`, API async) |
| `numpy`            | `^2.1.1`         | Procesamiento de rejillas de viento           |
| `shapely`          | `^2.0.6`         | Operaciones geométricas                       |
| `geopandas`        | `^1.0.1`         | Análisis geoespacial                          |
| `python-dotenv`    | `^1.0.1`         | Carga de `.env`                               |
| `pytest`           | `^8.3.3`         | Tests del backend                             |
| `pytest-asyncio`   | `^0.24.0`        | Soporte async en tests                        |
| `fakeredis`        | `^2.24.1`        | Mock de Redis en tests                        |

> [!NOTE]
> El cliente asíncrono es `redis>=5` (API `redis.asyncio`), el sucesor mantenido de `aioredis` (fusionado en `redis-py` ≥ 4.2). El DSN `REDIS_URL` es compatible.

### 8.3 Runtimes e Infraestructura

| Componente | Versión         | Nota                                   |
| ---------- | --------------- | -------------------------------------- |
| Node.js    | 22 LTS          | Runtimes dev/CI.                 |
| Python     | 3.12            | Imagen del Dockerfile y CI.            |
| Redis      | 7.x (`redis:7-alpine`) | Modo persistente (`--appendonly`). |
| PostgreSQL | 18 (`timescale/timescaledb:latest-pg18`) | Históricos + sesiones anonimizadas. |
| Docker     | 24+ / Compose v2| Orquestación local y VPS.              |
| Nginx      | 1.24+           | Reverse proxy + TLS (Opción B).        |

---

*Este documento complementa el [Stack Tecnológico](./GAIA_TECH_STACK.md) y la [Estructura del Proyecto](./GAIA_PROJECT_STRUCTURE.md) de GAIA.*