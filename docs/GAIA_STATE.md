# GAIA — Especificación del Estado Global (Valtio)

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## 1. Propósito

Definir la forma (shape) completa del estado global de la aplicación gestionado con Valtio, las reglas de mutación desde Three.js y React, y los contratos de suscripción reactiva.

---

## 2. Interfaz Raíz del Estado

Contenido: La interfaz TypeScript `GaiaState` completa con todas las propiedades anidadas que componen el estado de la aplicación.

Incluirá:
- Estado de visibilidad de capas (fire, wind, seismic, flood, radiation).
- Filtro temporal activo (24h, 7d, 30d).
- Nivel del mar actual (slider: 0–10m).
- Objeto seleccionado por raycasting (tipo, datos crudos, instanceId).
- Estado de conexión / modo resguardo por módulo.
- Datos de telemetría del panel flotante.
- Contadores de rendimiento (FPS, draw calls).

---

## 3. Sub-estados por Módulo

Contenido: Interfaces tipadas para cada sub-estado funcional:
- `LayerVisibility` — Toggles de capas.
- `TimeFilter` — Rango temporal activo.
- `SelectedObject` — Unión discriminada (fire | quake | wind | radiation | null).
- `FloodState` — Nivel del mar y estado del shader.
- `ConnectionStatus` — Estado por fuente de datos (live, cached, fallback, error).
- `TelemetryPanel` — Datos activos del panel flotante del HUD.

---

## 4. Reglas de Mutación

Contenido: Documentar las dos vías de escritura del estado:
- **Desde el render loop de Three.js (60 FPS):** Mutación imperativa directa (`state.x = value`). Qué propiedades se mutan desde aquí y cuáles no.
- **Desde componentes React:** Mutación vía handlers de eventos (sliders, toggles, clicks). Qué propiedades controla React exclusivamente.
- **Tabla de propiedad:** Qué hilo "posee" cada propiedad del estado para evitar race conditions.

---

## 5. Suscripciones Reactivas (React ↔ Three.js)

Contenido: Documentar cómo los componentes React se suscriben a porciones específicas del estado usando `useSnapshot()` de Valtio, y cómo el render loop de Three.js lee el proxy directamente sin `useSnapshot`.

---

## 6. Acciones y Transiciones

Contenido: Catálogo de acciones que modifican el estado:
- `toggleLayer(layer)` — Activa/desactiva una capa.
- `setTimeFilter(range)` — Cambia el filtro temporal.
- `setSeaLevel(meters)` — Actualiza el nivel del mar.
- `selectObject(type, data)` — Selecciona un objeto por raycasting.
- `clearSelection()` — Limpia la selección activa.
- `setConnectionStatus(module, status)` — Actualiza el estado de conexión de un módulo.

---

*Este documento complementa el [Stack Tecnológico](./GAIA_TECH_STACK.md) y los [Workflows](./GAIA_WORKFLOWS.md) del proyecto GAIA.*
