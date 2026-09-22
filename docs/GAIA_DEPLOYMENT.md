# GAIA — Guía de Despliegue

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## 1. Propósito

Documentar cómo se construye, despliega y opera GAIA en distintos entornos (desarrollo local, staging, producción), incluyendo la infraestructura, los servicios necesarios y las variables de configuración.

---

## 2. Arquitectura de Despliegue

Contenido: Diagrama de la infraestructura en producción:
- Frontend estático (Vercel / Netlify / Nginx).
- Backend FastAPI (Railway / Render / Docker + VPS).
- Redis (Redis Cloud / Docker local).
- CDN para assets estáticos (texturas, heightmaps).

---

## 3. Desarrollo Local

Contenido:
- Requisitos previos: Node.js, Python, Redis, Docker (opcional).
- Comandos para levantar frontend (`npm run dev`) y backend (`uvicorn`).
- Configuración de `.env.local` con variables de desarrollo.
- Hot reload de shaders GLSL con Webpack.
- Redis local vía Docker o instalación nativa.

---

## 4. Variables de Entorno

Contenido: Tabla con todas las variables de entorno necesarias:
- API Keys opcionales (NASA FIRMS `MAP_KEY`, Mapbox `access_token`).
- URL de Redis (`REDIS_URL`).
- Configuración de CORS (`CORS_ORIGINS`).
- Modo debug (`DEBUG`).
- TTL de caché por módulo.
- Puerto del backend y URL pública del frontend.

---

## 5. Build de Producción

Contenido:
- Comando de build del frontend (`npm run build`) y optimizaciones de Webpack 5 (tree-shaking, code splitting, minificación de shaders).
- Budget de bundle: tamaños objetivo para JS, CSS y assets.
- Dockerfile para el backend FastAPI.
- `docker-compose.yml` para orquestar backend + Redis.

---

## 6. Despliegue en Producción

Contenido:
- Opción A: Frontend en Vercel/Netlify + Backend en Railway/Render.
- Opción B: Docker Compose completo en VPS (DigitalOcean, Hetzner).
- Configuración de Nginx como reverse proxy (si aplica).
- HTTPS / TLS: certificados Let's Encrypt.
- CI/CD: GitHub Actions pipeline (lint → test → build → deploy).

---

## 7. Monitoreo y Operaciones

Contenido:
- Health check endpoint (`GET /health`).
- Logging estructurado (FastAPI + Uvicorn).
- Métricas de caché Redis (hit rate, TTL expirados).
- Alertas si las APIs externas fallan sostenidamente.

---

## 8. Versiones del Stack

Contenido: Tabla con las versiones específicas de cada dependencia principal:
- three.js, React, TypeScript, Webpack, Valtio, Comlink, Tailwind CSS.
- FastAPI, Uvicorn, Redis, Pydantic, NumPy, Shapely, GeoPandas.
- Node.js y Python runtimes.

---

*Este documento complementa el [Stack Tecnológico](./GAIA_TECH_STACK.md) y la [Estructura del Proyecto](./GAIA_PROJECT_STRUCTURE.md) de GAIA.*
