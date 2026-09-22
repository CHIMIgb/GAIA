# GAIA — Visualizador Geoespacial 3D en Tiempo Real

> Plataforma de monitoreo ambiental que integra incendios, sismos, viento, inundaciones y radiación sobre un globo terráqueo interactivo renderizado con WebGL/Three.js a 60 FPS.

---

## Documentación

| Documento | Descripción |
| --------- | ----------- |
| [Especificación Técnica](docs/GAIA_SPECIFICATION.md) | Arquitectura de 4 capas, 14 requisitos funcionales (7 subsistemas) y 7 requisitos no funcionales. |
| [Stack Tecnológico](docs/GAIA_TECH_STACK.md) | TypeScript, Vite, Three.js + GLSL, React, Valtio, Web Workers + Comlink, FastAPI, Tailwind CSS — con justificación de cada elección. |
| [Contrato de API](docs/GAIA_API_CONTRACT.md) | Formato universal JSON `{ success, data, error }` para toda comunicación frontend ↔ backend. |
| [Workflows Funcionales](docs/GAIA_WORKFLOWS.md) | 8 flujos de trabajo detallados: inicialización, incendios, viento, sismos, inundación, interacción, resiliencia y radiación. |
| [Catálogo de APIs](docs/GAIA_DATA_SOURCES.md) | 21 APIs y fuentes de datos gratuitas organizadas por módulo funcional. |
| [APIs del Globo](docs/GAIA_GLOBE_TEXTURES.md) | Textura satelital (Esri), heightmaps DEM (Terrarium) y altimetría puntual (Open-Meteo). |
| [Estructura del Proyecto](docs/GAIA_PROJECT_STRUCTURE.md) | Mapa de carpetas y archivos del monorepo (frontend + backend). |
| [Estado Global (Valtio)](docs/GAIA_STATE.md) | Forma del estado, reglas de mutación Three.js vs React y catálogo de acciones. |
| [Plan de Testing](docs/GAIA_TESTING.md) | Métricas de rendimiento, pruebas de memoria GPU, resiliencia de red y compatibilidad. |
| [Guía de Despliegue](docs/GAIA_DEPLOYMENT.md) | Desarrollo local, Docker, CI/CD, variables de entorno y versiones del stack. |
| [Seguridad](docs/GAIA_SECURITY.md) | Rate limiting, protección DDoS, XSS, sesiones por cookie sin cuentas y endurecimiento. |
| [Base de Datos](docs/GAIA_DATABASE.md) | Postgres/TimescaleDB para históricos, ingesta, API de consulta y evaluación de sesiones. |
| [Roadmap de Desarrollo](docs/GAIA_ROADMAP.md) | 14 fases incrementales: construcción de un módulo a la vez (de extremo a extremo) con pasos pequeños, criterios de aceptación y trazabilidad RF/RNF. |
| [Recomendaciones Técnicas](docs/GAIA_RECOMENDACIONES.md) | Auditoría objetiva de la documentación: fortalezas, deudas técnicas y recomendaciones accionables priorizadas (P0–P3). |

---

## Stack

| Capa | Tecnología |
| ---- | ---------- |
| Lenguaje | TypeScript (strict) |
| Bundler | Vite |
| Motor 3D | Three.js + GLSL |
| UI | React + Tailwind CSS |
| Estado | Valtio |
| Workers | Web Workers + Comlink |
| Backend | FastAPI + Redis + PostgreSQL 18 / TimescaleDB |

## Fuentes de Datos

NASA FIRMS · USGS Earthquakes · Open-Meteo · AWS Terrarium · Esri World Imagery · Safecast · EURDEP · EPA RadNet · GMCMap · GEBCO · Natural Earth

---

## Licencia

Pendiente de definir.
