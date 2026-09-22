# GAIA — Plan de Testing y Métricas de Rendimiento

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## 1. Propósito

Definir cómo se verifican los requisitos funcionales (RF) y no funcionales (RNF) de GAIA, qué herramientas se usan, qué umbrales de aceptación aplican y qué tests automatizados se implementan.

---

## 2. Métricas de Rendimiento GPU (RNF-01, RNF-02)

Contenido:
- Herramientas de medición: `stats.js` (Three.js), Chrome DevTools Performance Panel, `renderer.info` de Three.js.
- Umbral de aceptación para FPS (60 FPS estables con >20,000 datos combinados).
- Umbral de aceptación para draw calls (≤ 8 por frame).
- Procedimiento de prueba: carga simultánea de todas las capas + medición sostenida durante 60 segundos.
- Escenarios de estrés: 50,000 datos combinados para detectar degradación.

---

## 3. Métricas de Carga (RNF-06)

Contenido:
- Herramientas: Lighthouse, WebPageTest, `performance.mark()` / `performance.measure()`.
- Umbral FCP: < 2.0 segundos.
- Umbral de globo interactivo: < 3.5 segundos.
- Condiciones de red simuladas (3G, 4G, cable) y tamaño de assets (budget de bundle).

---

## 4. Pruebas de Memoria GPU (RNF-04)

Contenido:
- Herramientas: `renderer.info.memory` de Three.js, Chrome Task Manager (GPU Process), DevTools Memory tab.
- Escenario: alternar capas y filtros 100 veces consecutivas y verificar que `geometries`, `textures` y `programs` no crecen.
- Criterio de aceptación: cero crecimiento neto de objetos GPU tras ciclo de toggle completo.

---

## 5. Tests de Resiliencia de Red (RNF-05)

Contenido:
- Simulación de fallo de APIs externas (mock de timeout, HTTP 5xx, rate-limit 429).
- Verificación de la cadena de fallback: Redis → API → Local.
- Verificación de que el HUD muestra el indicador "MODO RESGUARDO".
- Herramientas: pytest (backend), msw o fetch mocking (frontend).

---

## 6. Tests Unitarios y de Integración

Contenido:
- **Backend (FastAPI/Python):** pytest + httpx.AsyncClient para cada endpoint. Cobertura de normalización de unidades (CPM → µSv/h), validación de parámetros, formato de contrato universal.
- **Frontend (TypeScript):** Vitest o Jest para funciones puras (conversión de coordenadas, decodificación Terrarium, escalado FRP → color). Tests de workers con mocks de `postMessage`.
- **Contratos de API:** Tests que validen que toda respuesta del backend cumple el schema `{ success, data, error }`.

---

## 7. Tests de Compatibilidad de Navegadores (RNF-07)

Contenido:
- Navegadores objetivo: Chrome, Firefox, Safari, Edge.
- Verificación de soporte WebGL 2.0 y Web Workers.
- Herramientas: BrowserStack o testing manual en cada navegador.
- Checklist de funcionalidades por navegador.

---

## 8. Matriz de Verificación: RNF ↔ Método de Prueba

Contenido: Tabla que mapea cada RNF a su herramienta de medición, umbral de aceptación y frecuencia de ejecución (manual, CI, pre-deploy).

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md) del proyecto GAIA.*
