# GAIA — Recomendaciones de Revisión Técnica

> **Proyecto:** GAIA 3D
> **Versión del Documento:** 1.1
> **Fecha:** 2026-09-22
> **Alcance:** Auditoría objetiva de la documentación tras la pasada de unificación (commit `ba72761`).

---

## 1. Veredicto

La documentación quedó **internamente coherente** (Vite, FastAPI, contrato único `{success, data, error}`, endpoints unificados, versiones alineadas). Es documentación de nivel senior por estructura, trazabilidad y rigor — pero tiene una **crítica estructural**: está sobre-planificada para un proyecto que **aún no tiene una línea de código**.

Este documento registra los hallazgos y las recomendaciones accionables, ordenadas por impacto.

---

## 2. Fortalezas que hay que preservar

1. **Separación de concerns documental**: SPEC / TECH_STACK / API_CONTRACT / DATA_SOURCES / WORKFLOWS / STATE / DEPLOYMENT / SECURITY / DATABASE / ROADMAP son dominios bien delimitados.
2. **Trazabilidad RF/RNF**: cada shader, endpoint y workflow cita su requisito.
3. **ROADMAP de 332 micro-pasos** con criterios de aceptación, estimaciones en horas y fases con hito visible.
4. **Presupuestos medibles**: draw calls ≤ 8, p95 ≤ 18 ms, FCP < 2 s, bundle ≤ 450 KB gzip.
5. **Seguridad con sustancia**: sesión sin PII (sha256), rate-limit, cadena de fallback, CSP con nonce.

---

## 3. Riesgos y deudas técnicas detectadas

### 3.1 Cero código — sobre-planificación
~7900 líneas de documentación y ningún `frontend/` ni `backend/`. La primera pregunta en una entrevista será *"¿cuándo se ejecuta?"*. La documentación sin implementación es teoría que se desactualiza en el primer mes de código real.

### 3.2 Valores canónicos duplicados (causa raíz del drift)
El contrato de API aparecía en 7 documentos; los TTL, rate-limits, módulos y endpoints en varios más. Esto provocó las incoherencias Webpack/Vite, FastAPI/Node y `{ok, error}`/`{success, data, error}`. El ROADMAP §1.1 dice "los valores viven en el doc técnico", pero el resto de docs **viola** ese principio repitiéndolos.

### 3.3 Historia del viento (GRIB2) con dos implementaciones
- `DATA_SOURCES` y `TECH_STACK` dicen que **FastAPI** pre-procesa GRIB2 con `cfgrib`/`xarray` en Python.
- `SPEC` dice que **Worker 3** lo decodifica en el navegador (JS).

Si el backend ya normalizó la rejilla, ¿qué decodifica el Worker 3? Hay que elegir una y degradar la otra a fallback.

### 3.4 `SharedArrayBuffer` sin `COOP`/`COEP`
`SPEC`/`TECH_STACK` prometen `SharedArrayBuffer` (zero-copy), que **requiere** los headers `Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy` en producción. No aparecen en `SECURITY` ni `DEPLOYMENT`: tal cual está planificado, no funcionará en el navegador.

### 3.5 Rate-limit con dos implementaciones
`SECURITY` menciona `slowapi`; el ROADMAP pide "middleware sobre Redis" (custom). Son dos soluciones: hay que elegir una.

### 3.6 Números fácticos con riesgo
- `timescale/timescaledb:latest-pg18`: la compatibilidad de TimescaleDB con PostgreSQL 18 va con retraso; puede no existir la imagen.
- "Three.js ~600 KB minificado": orden de magnitud correcto, pero es aspiración, no medición.
- p95 ≤ 18 ms sin especificar hardware de referencia.

### 3.7 Estado del ROADMAP engañoso
"Estado: Aprobado y **ejecutado**" → debería decir **"Planificado"** hasta que exista la Fase 0.

### 3.8 Idioma
Los documentos están en español. Correcto para el contexto actual, pero si el portfolio apunta a mercado global, el inglés multiplica el alcance. Decisión consciente, no un defecto.

---

## 4. Recomendaciones priorizadas

### 4.1 [P0] Arrancar la Fase 0 — código real
Parar de escribir documentación y validar con implementación:

- [ ] Scaffold `frontend/` con Vite (react-ts) + benchmark de bundle.
- [ ] `backend/` FastAPI + Uvicorn con `GET /api/health` (contrato universal).
- [ ] Conexión Redis async (`redis>=5`) con `PING` + TTL.
- [ ] Migración Alembic inicial y test de contrato.

### 4.2 [P1] Manifiesto único de valores canónicos
- [ ] Crear una tabla central y única (endpoints, TTL, rate-limits, presupuestos, códigos de error) en un solo documento.
- [ ] Hacer que el resto de docs lo **referencie** en vez de repetir los valores.

### 4.3 [P1] Resolver la arquitectura del viento ✅ (aplicado)
- [x] Decidir: el procesado GRIB2 vive en el **backend FastAPI** (no en Worker 3).
- [x] Ajustar `SPEC` para que Worker 3 solo interpole rejillas normalizadas (ya aplicado en `SPEC` §2.3 y §3; el backend sirve binarios `u/v` compactos).

### 4.4 [P1] `SharedArrayBuffer` y headers de contexto ✅ (documentado)
- [x] Documentar `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` en `SPEC` §2.3 (condición para zero-copy).
- [ ] Pendiente: reflejar ambos headers en `SECURITY` y `DEPLOYMENT` al implementar el despliegue.

### 4.5 [P2] Rate-limit: una sola implementación
- [ ] Elegir entre `slowapi` y middleware custom sobre Redis y dejar un solo referente en docs.

### 4.6 [P2] Endurecer números fácticos
- [x] `timescaledb:latest-pg18` **existe** (imagen oficial; verificar pin de versión en despliegue real).
- [ ] Anotar los presupuestos de rendimiento como *objetivos medibles* con hardware de referencia.

### 4.7 [P2] Estado del ROADMAP ✅ (aplicado)
- [x] Cambiar a "Estado: Planificado" (aplicado en `ROADMAP` §1); volver a "Aprobado y ejecutado" fase por fase conforme se implementa.

### 4.8 [P3] Decisión de idioma
- [ ] Fijar español/inglés como criterio explícito (o plan de bilingüe) para evitar drift futuro.

---

## 5. Regla general

La documentación demuestra su valor real **cuando el código existe y los docs le siguen**. Cada fase implementada debe cerrar actualizando los documentos, no al revés.