# GAIA — Workflows Funcionales del Sistema

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.2  
> **Fecha:** 2026-09-22  

---

## Índice de Workflows

| #   | Workflow                                              | Requisitos Vinculados              |
| --- | ----------------------------------------------------- | ---------------------------------- |
| 1   | [Inicialización del Sistema, Globo 3D y Atmósfera](#workflow-1-inicialización-del-sistema-globo-3d-y-capa-atmosférica)      | RF-01, RF-02, RNF-01, RNF-06, RNF-07 |
| 2   | [Ingesta y Renderizado de Incendios (NASA FIRMS)](#workflow-2-ingesta-procesamiento-y-renderizado-de-incendios-nasa-firms)   | RF-03, RF-04, RNF-02, RNF-03, RNF-04 |
| 3   | [Campo de Partículas de Viento en GPU](#workflow-3-campo-de-partículas-de-viento-en-gpu-open-meteo--noaa)                    | RF-05, RF-06, RNF-01, RNF-03         |
| 4   | [Monitoreo Sísmico y Ondas de Choque (USGS)](#workflow-4-monitoreo-sísmico-y-animación-de-ondas-de-choque-usgs)              | RF-07, RF-08, RNF-02, RNF-03         |
| 5   | [Simulación de Inundación y Nivel del Mar](#workflow-5-simulación-dinámica-de-inundación-y-nivel-del-mar)                    | RF-09, RF-10, RNF-01                 |
| 6   | [Interacción, Telemetría y Filtrado Temporal](#workflow-6-interacción-del-usuario-selección-de-telemetría-y-filtrado-temporal)| RF-11, RF-12, RNF-04                 |
| 7   | [Resiliencia y Manejo de Fallos (Fallback)](#workflow-7-resiliencia-y-manejo-de-fallos-data-fallback)                        | RNF-05                               |
| 8   | [Ingesta y Mapeo Radiológico (Safecast / EURDEP)](#workflow-8-ingesta-normalización-y-mapeo-radiológico-safecast--eurdep--gmcmap--radnet) | RF-13, RF-14, RNF-01, RNF-03, RNF-04 |

---

## Workflow 1: Inicialización del Sistema, Globo 3D y Capa Atmosférica

**Requisitos vinculados:** RF-01, RF-02, RNF-01, RNF-06, RNF-07

### Diagrama de Flujo

```
[Inicio / Carga de App]
        │
        ▼
[Inicializar WebGL Context & Canvas]
        │
        ▼
[Cargar Texturas & Heightmap] ──────────────────────────┐
        │                                                │
        ▼                                                ▼
[Instanciar Shaders GLSL]                    [Inicializar Web Workers]
        │                                    (W1: Ingesta, W2: Octree,
        │                                     W3: Viento) — en paralelo
        ▼
[Render Loop 60 FPS]
        │
        ▼
[Montar HUD React]
        │
        ▼
[FCP < 2.0s — Globo Interactivo]
```

### Secuencia Detallada

#### Paso 1 — Entrada

El usuario abre la aplicación en el navegador.

#### Paso 2 — Carga de Assets y Web Workers

- Vite / Navegador descarga los scripts minificados y assets estáticos:
  - Texturas del planeta (diffuse map, specular map, normal map).
  - Heightmap de elevación GEBCO (batimetría y relieve continental).
- Se instancian e inicializan **en paralelo** los tres Web Workers principales:

  | Worker     | Responsabilidad                             |
  | ---------- | ------------------------------------------- |
  | Worker 1   | Ingesta, normalización y Spatial Hashing    |
  | Worker 2   | Particionado espacial (Octree 3D)           |
  | Worker 3   | Decodificador de vectores de viento         |

#### Paso 3 — Generación de la Esfera y Shaders (Hilo Principal — Three.js)

1. Se crea la **malla esférica base** del globo terráqueo (`SphereGeometry` con segmentación alta).
2. Se aplica el **shader GLSL de dispersión atmosférica** (efecto Fresnel / Rayleigh) y el ciclo de iluminación día/noche → **RF-01**.
3. Se aplica el **mapa de elevación** (displacement map) sobre los vértices para proyectar el relieve topográfico continental y oceánico → **RF-02**.

```glsl
// Vertex Shader — Displacement de elevación (simplificado)
uniform sampler2D u_heightmap;
uniform float u_displacementScale;

void main() {
  float elevation = texture2D(u_heightmap, uv).r;
  vec3 displaced = position + normal * elevation * u_displacementScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
```

#### Paso 4 — Montaje de Interfaz Táctica

- React inicializa los componentes sobrepuestos del HUD:
  - Controles de capas (toggles de Fuego, Viento, Sismos, Inundación).
  - Time-scrubber (filtro temporal).
  - Monitores de telemetría.
- Se alcanza el **First Contentful Paint (FCP) en $< 2.0\text{s}$** → **RNF-06**.
- El globo es interactivo a **60 FPS** → **RNF-01**.

> [!IMPORTANT]
> La inicialización de Workers ocurre en paralelo con la carga de texturas y la creación de la escena. Esto es esencial para cumplir con el objetivo de FCP $< 2.0\text{s}$ (RNF-06).

---

## Workflow 2: Ingesta, Procesamiento y Renderizado de Incendios (NASA FIRMS)

**Requisitos vinculados:** RF-03, RF-04, RNF-02, RNF-03, RNF-04

### Diagrama de Flujo

```
[Activar Capa Incendios / Timer Auto]
        │
        ▼
[Frontend fetch → FastAPI Proxy]
        │
        ▼
[FastAPI: NASA FIRMS API + Redis Cache]
        │
        ▼
[Respuesta JSON/CSV → Worker 1]
        │
        ▼
[Worker 1: Parse + Conversión Geodésica→Cartesiana + Escala FRP]
        │
        ▼
[Empaquetar Float32Array (posiciones + colores)]
        │
        ▼
[Transferable Objects → Hilo Principal (zero-copy)]
        │
        ▼
[Actualizar InstancedMesh (atributos de instancia)]
        │
        ▼
[GPU: Render miles de focos — 1 Draw Call]
```

### Secuencia Detallada

#### Paso 1 — Disparador

Activación de la capa de incendios en el HUD **o** intervalo de actualización programado (polling configurable).

#### Paso 2 — Petición y Proxy (FastAPI)

- El frontend invoca `GET /api/fires?hours=24`.
- El backend FastAPI:
  1. Consulta Redis por datos en caché (TTL: 5 min).
  2. Si no hay caché, realiza la petición asíncrona a la API de **NASA FIRMS** (VIIRS/MODIS).
  3. Gestiona rate-limits y cabeceras CORS de forma transparente.
  4. Retorna los datos en el [formato de contrato universal](./GAIA_API_CONTRACT.md).

#### Paso 3 — Procesamiento Multihilo (Worker 1)

El JSON/CSV crudo se envía directamente a **Worker 1**, que ejecuta:

1. **Parseo** de cada registro de anomalía térmica.
2. **Conversión de coordenadas geodésicas** $(\text{Lat}, \text{Lon})$ a vectores cartesianos 3D $(X, Y, Z)$ sobre la superficie del planeta:

$$
\begin{aligned}
X &= R \cdot \cos(\text{lat}) \cdot \cos(\text{lon}) \\
Y &= R \cdot \sin(\text{lat}) \\
Z &= R \cdot \cos(\text{lat}) \cdot \sin(\text{lon})
\end{aligned}
$$

3. **Escalado de FRP** (Potencia Radiativa del Fuego en $\text{MW/km}^2$) a una matriz de color y tamaño:

   | FRP Range          | Color RGBA                    | Escala de Tamaño |
   | ------------------ | ----------------------------- | :--------------: |
   | $< 10$ MW          | Amarillo tenue `(1, 0.9, 0.3)` |     `0.5x`       |
   | $10 - 50$ MW       | Naranja `(1, 0.5, 0.1)`       |     `1.0x`       |
   | $50 - 200$ MW      | Rojo incandescente `(1, 0.1, 0.0)` |  `1.5x`       |
   | $> 200$ MW         | Blanco caliente `(1, 1, 0.9)` |     `2.0x`       |

→ **RF-03, RF-04**

#### Paso 4 — Transferencia de Memoria Zero-Copy

- Worker 1 empaqueta las posiciones $(X, Y, Z)$ y colores $(R, G, B, A)$ en un `Float32Array`.
- Se transfiere al hilo principal mediante **Transferable Objects** sin duplicar memoria → **RNF-03**.

```typescript
// Dentro del Worker 1
const buffer = new Float32Array(count * 7); // x,y,z,r,g,b,scale por punto
// ... poblar buffer ...
self.postMessage({ type: 'FIRES_READY', buffer }, [buffer.buffer]);
```

#### Paso 5 — Renderizado en GPU (Three.js)

- El hilo principal actualiza los atributos del `InstancedMesh` de incendios.
- La GPU dibuja miles de puntos de fuego con gradiente de color según FRP en **una sola draw call** → **RNF-02**.

> [!NOTE]
> Al actualizar datos, las geometrías y materiales anteriores se liberan con `dispose()` antes de asignar los nuevos (RNF-04).

---

## Workflow 3: Campo de Partículas de Viento en GPU (Open-Meteo / NOAA)

**Requisitos vinculados:** RF-05, RF-06, RNF-01, RNF-03

### Diagrama de Flujo

```
[Activar Capa Viento]
        │
        ▼
[Descargar Dataset Binario GRIB2/JSON (Open-Meteo)]
        │
        ▼
[Worker 3: Decodificar Rejilla Global de Vectores (U, V)]
        │
        ▼
[Generar DataTexture (U, V) como textura de datos]
        │
        ▼
[Transferir a Hilo Principal → Subir a GPU]
        │
        ▼
[Inicializar VBO de Partículas (posiciones semilla)]
        │
        ▼
[Cada Frame: Vertex Shader lee DataTexture (U,V)]
        │
        ▼
[GPU calcula nueva posición 3D de cada partícula]
        │
        ▼
[Transform Feedback escribe nuevas posiciones al VBO]
        │
        ▼
[Loop continuo a 60 FPS — partículas fluyen sobre la atmósfera]
```

### Secuencia Detallada

#### Paso 1 — Disparador

Activación de la capa de viento en el HUD.

#### Paso 2 — Decodificación de Matriz de Viento (Worker 3)

1. Se descarga el dataset binario GRIB2/JSON de componentes de viento $(U, V)$ desde **Open-Meteo** (vía FastAPI proxy).
2. **Worker 3** decodifica la rejilla global:
   - Calcula magnitudes: $\text{speed} = \sqrt{U^2 + V^2}$
   - Calcula direcciones: $\theta = \text{atan2}(V, U)$
   - Genera una **textura de datos binarios** conteniendo los vectores de velocidad por coordenada.

#### Paso 3 — Carga en GPU (Textures & VBO)

- La matriz de vectores $(U, V)$ procesada se envía a la GPU como una `DataTexture` (textura flotante RGBA).
- Se inicializa un **Vertex Buffer Object (VBO)** con las posiciones semilla de miles de partículas distribuidas aleatoriamente sobre la superficie atmosférica.

```typescript
// Creación de DataTexture para campo de viento
const windData = new Float32Array(gridWidth * gridHeight * 4); // RGBA
// R = U component, G = V component, B = speed, A = reserved
const windTexture = new THREE.DataTexture(
  windData, gridWidth, gridHeight,
  THREE.RGBAFormat, THREE.FloatType
);
```

#### Paso 4 — Actualización e Interpolación en Shaders (Cada Frame)

1. Un **vertex shader** o mecanismo de **Transform Feedback** lee la textura de viento en cada fotograma.
2. El shader **interpola bilinealmente** el vector de viento $(U, V)$ en la posición actual de cada partícula.
3. Calcula la nueva posición 3D desplazada directamente en la GPU → **RF-05, RF-06**.

```glsl
// Vertex Shader — Actualización de partícula de viento (simplificado)
uniform sampler2D u_windField;     // DataTexture (U,V)
uniform float u_deltaTime;
uniform float u_speedFactor;

attribute vec3 a_position;         // Posición actual de la partícula

void main() {
  // Convertir posición 3D a coordenadas UV del mapa
  vec2 uv = positionToUV(a_position);

  // Leer vector de viento interpolado
  vec4 wind = texture2D(u_windField, uv);
  float U = wind.r;
  float V = wind.g;

  // Desplazar partícula según viento
  vec3 displacement = windToCartesian(U, V, a_position) * u_speedFactor * u_deltaTime;
  vec3 newPosition = normalize(a_position + displacement) * u_globeRadius;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  gl_PointSize = 2.0;
}
```

4. **Transform Feedback** escribe las nuevas posiciones de vuelta al VBO, creando un ciclo continuo sin intervención del CPU → **RNF-01**.

> [!TIP]
> Las partículas que alcanzan el final de su vida útil (TTL) se reciclan: su posición se resetea a un punto aleatorio sobre la superficie, manteniendo una densidad visual constante sin crear ni destruir geometría.

---

## Workflow 4: Monitoreo Sísmico y Animación de Ondas de Choque (USGS)

**Requisitos vinculados:** RF-07, RF-08, RNF-02, RNF-03

### Diagrama de Flujo

```
[Activar Capa Sismos / Timer Auto]
        │
        ▼
[Frontend fetch → FastAPI Proxy → USGS GeoJSON]
        │
        ▼
[Worker 1: Normalización (magnitud, profundidad, coords)]
        │
        ▼
[Worker 2: Indexado en Octree 3D (proximidad espacial)]
        │
        ▼
[Transferir datos procesados → Hilo Principal]
        │
        ▼
[Renderizar Columnas Cilíndricas (InstancedMesh)]
    │                    │
    │                    ▼
    │         [¿Sismo reciente < 2h?]
    │              │ SÍ          │ NO
    │              ▼             │
    │   [Activar Shader de      │
    │    Onda Concéntrica]      │
    │              │             │
    ▼              ▼             ▼
[GPU: Render Columnas + Ondas — InstancedMesh (1-2 Draw Calls)]
```

### Secuencia Detallada

#### Paso 1 — Disparador

Consulta del feed GeoJSON de la USGS (terremotos de las últimas 24h / 7 días / 30 días según filtro activo).

#### Paso 2 — Normalización y Particionado Espacial (Workers 1 & 2)

**Worker 1 — Normalización:**
- Extrae de cada evento sísmico:
  - Magnitud (escala de Richter).
  - Profundidad del hipocentro (km).
  - Coordenadas geográficas.
  - Timestamp del evento.
- Convierte coordenadas geodésicas a cartesianas 3D.

**Worker 2 — Indexado Octree 3D:**
- Inserta los eventos normalizados en un **Octree 3D**.
- Permite consultas de proximidad rápidas:
  - ¿Qué sismos están cerca de centros urbanos?
  - ¿Qué sismos se agrupan en zonas de placas tectónicas?

#### Paso 3 — Representación Volumétrica (Three.js)

El hilo principal renderiza cada sismo como una **geometría cilíndrica extruida** mediante `InstancedMesh`:

| Propiedad del Cilindro | Mapeo de Datos                                     |
| ---------------------- | -------------------------------------------------- |
| **Altura**             | Proporcional a la **profundidad del hipocentro**   |
| **Radio**              | Proporcional a la **magnitud** (escala de Richter) |
| **Color**              | Gradiente según magnitud (verde → amarillo → rojo) |

→ **RF-07**

```typescript
// Cálculo de dimensiones del cilindro por sismo
const height = (quake.depth_km / MAX_DEPTH) * MAX_CYLINDER_HEIGHT;
const radius = Math.pow(2, quake.magnitude - 3) * BASE_RADIUS; // Escala exponencial
```

#### Paso 4 — Disparo de Ondas de Choque

Si se detecta un evento sísmico **reciente** ($< 2$ horas):

1. Se activa un **shader de anillo concéntrico** sobre la corteza terrestre.
2. El anillo se expande radialmente representando la propagación de **ondas P y S** → **RF-08**.

```glsl
// Fragment Shader — Onda sísmica concéntrica (simplificado)
uniform float u_time;
uniform vec3 u_epicenter;
uniform float u_waveSpeed;

varying vec3 v_worldPos;

void main() {
  float dist = distance(v_worldPos, u_epicenter);
  float waveFront = u_time * u_waveSpeed;
  float ring = smoothstep(waveFront - 0.02, waveFront, dist)
             - smoothstep(waveFront, waveFront + 0.02, dist);

  vec3 waveColor = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 1.0, 0.0), ring);
  gl_FragColor = vec4(waveColor, ring * 0.7);
}
```

> [!NOTE]
> Las columnas sísmicas y las ondas de choque se renderizan con `InstancedMesh`, manteniéndose dentro del presupuesto de **≤ 8 draw calls por frame** (RNF-02).

---

## Workflow 5: Simulación Dinámica de Inundación y Nivel del Mar

**Requisitos vinculados:** RF-09, RF-10, RNF-01

### Diagrama de Flujo

```
[Usuario desliza Slider "Nivel del Mar" (+0m a +10m)]
        │
        ▼
[Valtio: state.flood.seaLevel = nuevoValor]
        │
        ├──────────────────────────────┐
        ▼                              ▼
[Three.js: Actualizar             [React: Actualizar
 Uniform u_seaLevel]               Label del Slider]
        │                         (re-render quirúrgico)
        ▼
[Vertex Shader: Recalcular superficie de agua]
        │
        ▼
[Fragment Shader: Comparar elevación vs u_seaLevel]
        │
        ├── elevación > u_seaLevel ──► [Renderizar terreno normal]
        │
        └── elevación ≤ u_seaLevel ──► [Enmascarar como zona sumergida]
                                               │
                                               ▼
                                    [Aplicar Shader de Agua:
                                     Transparencia + Refracción]
```

### Secuencia Detallada

#### Paso 1 — Disparador

El usuario desliza el control del **Nivel del Mar** en la interfaz de React ($+0\text{m}$ a $+10\text{m}$) → **RF-09**.

#### Paso 2 — Actualización de Parámetros Shaders (Sin re-render masivo de React)

- La mutación del estado del slider se realiza mediante **Valtio**:

  ```typescript
  // En el componente React del slider
  state.flood.seaLevel = sliderValue; // Mutación directa vía Proxy
  ```

- El valor numérico se envía directamente al material del globo **sin reconstruir el árbol DOM de React**.
- Se actualiza la variable `uniform float u_seaLevel` en el fragment/vertex shader de la malla.

  ```typescript
  // En el render loop de Three.js (cada frame)
  globeMaterial.uniforms.u_seaLevel.value = state.flood.seaLevel;
  ```

#### Paso 3 — Cálculo de Mascarado e Inundación Costera (GLSL)

1. El **fragment shader** compara el valor codificado en el heightmap de elevación con la variable `u_seaLevel`.
2. Las áreas continentales cuya altitud sea **inferior al umbral seleccionado** se enmascaran y renderizan con el shader de agua transparente y refractiva → **RF-10**.

```glsl
// Fragment Shader — Inundación costera (simplificado)
uniform float u_seaLevel;
uniform sampler2D u_heightmap;
uniform sampler2D u_diffuseMap;

varying vec2 v_uv;

void main() {
  float elevation = texture2D(u_heightmap, v_uv).r * MAX_ELEVATION;
  vec4 terrainColor = texture2D(u_diffuseMap, v_uv);

  if (elevation <= u_seaLevel) {
    // Zona sumergida: aplicar shader de agua
    vec3 waterColor = vec3(0.0, 0.3, 0.7);
    float depth = (u_seaLevel - elevation) / max(u_seaLevel, 0.001);
    float alpha = mix(0.4, 0.85, depth); // Más profundo = más opaco
    gl_FragColor = vec4(waterColor, alpha);
  } else {
    // Terreno normal
    gl_FragColor = terrainColor;
  }
}
```

> [!TIP]
> Todo el cálculo de inundación ocurre **enteramente en la GPU** por pixel, sin intervención del CPU. Esto permite que el slider responda en tiempo real sin caída de FPS (RNF-01).

---

## Workflow 6: Interacción del Usuario, Selección de Telemetría y Filtrado Temporal

**Requisitos vinculados:** RF-11, RF-12, RNF-04

### Diagrama de Flujo

```
[Usuario hace clic en la escena 3D]
        │
        ▼
[Three.js Raycaster → Detectar InstancedMesh intersectado]
        │
        ▼
[Obtener instanceId del objeto seleccionado]
        │
        ▼
[Consultar metadatos en ArrayBuffer por índice]
        │
        ▼
[Valtio: state.selectedObject = { tipo, datos }]
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
[React: Mostrar Panel Flotante        [Three.js: Highlight
 con Telemetría del Objeto]             visual del objeto]

================================================

[Usuario cambia Filtro Temporal o Toggle de Capa]
        │
        ▼
[Valtio: state.filters = nuevosFiltros]
        │
        ▼
[Worker 1/2/3: Re-filtrar dataset binario en memoria]
        │
        ▼
[Transferir datos filtrados → Hilo Principal]
        │
        ▼
[Liberar VRAM de objetos descartados]
  geometry.dispose()
  material.dispose()
  texture.dispose()
        │
        ▼
[Reconstruir InstancedMesh con datos filtrados]
```

### Secuencia Detallada

#### Paso 1 — Interacción mediante Raycasting

1. El usuario hace clic sobre un **incendio, sismo o área del globo** en la vista 3D.
2. El sistema ejecuta un `Raycaster` optimizado que determina el **índice de la instancia** seleccionada dentro del `InstancedMesh`.

```typescript
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouse, camera);

const intersects = raycaster.intersectObject(fireInstancedMesh);
if (intersects.length > 0) {
  const instanceId = intersects[0].instanceId;
  // Recuperar datos del buffer por índice
}
```

#### Paso 2 — Consulta de Telemetría en Tiempo Real

Utilizando el índice del objeto, el sistema recupera los datos crudos almacenados en memoria y los despliega en el **panel flotante del HUD** → **RF-11**:

| Tipo de Objeto | Datos Mostrados en Panel                                        |
| -------------- | --------------------------------------------------------------- |
| **Incendio**   | Coordenadas, Temperatura de brillo (K), FRP ($\text{MW/km}^2$), Instrumento (VIIRS/MODIS), Confianza |
| **Sismo**      | Coordenadas, Magnitud (Richter), Profundidad (km), Lugar, Timestamp |
| **Viento**     | Coordenadas, Velocidad (nudos), Dirección (°), Componentes $(U, V)$ |

#### Paso 3 — Filtrado Temporal y Limpieza de VRAM

Si el usuario modifica el rango de tiempo (ej. "Últimas 24h" → "30 días") o deshabilita una capa → **RF-12**:

1. Los **Web Workers** vuelven a filtrar la base de datos binaria en memoria según el nuevo criterio.
2. El hilo principal **libera explícitamente la memoria VRAM** de los objetos descartados → **RNF-04**:

   ```typescript
   // Limpieza obligatoria antes de reconstruir
   oldFireMesh.geometry.dispose();
   oldFireMesh.material.dispose();
   if (oldTexture) oldTexture.dispose();
   scene.remove(oldFireMesh);
   ```

3. Se reconstruye el `InstancedMesh` con los datos filtrados recibidos del Worker.

> [!CAUTION]
> **Nunca** reasignar geometrías o materiales sin llamar a `dispose()` primero. Las texturas y buffers de GPU no son recolectados por el garbage collector de JavaScript — deben ser liberados manualmente para evitar fugas de VRAM (RNF-04).

---

## Workflow 7: Resiliencia y Manejo de Fallos (Data Fallback)

**Requisitos vinculados:** RNF-05

### Diagrama de Flujo

```
[Frontend solicita datos a FastAPI]
        │
        ▼
[FastAPI intenta fetch a API externa]
        │
        ├── ✅ Éxito ──► [Retornar datos + actualizar cache Redis]
        │
        └── ❌ Fallo (timeout / HTTP 5xx / rate-limit)
                │
                ▼
        [Interceptador de Excepciones FastAPI]
                │
                ▼
        [¿Existe caché en Redis?]
                │
                ├── SÍ ──► [Servir datos cacheados]
                │                   │
                │                   ▼
                │           [Respuesta con flag: cached = true]
                │
                └── NO ──► [Cargar GeoJSON local estático]
                                    │
                                    ▼
                            [Respuesta con flag: fallback = true]
                                    │
                                    ▼
                            [Frontend: Worker procesa datos de resguardo]
                                    │
                                    ▼
                            [HUD: Mostrar indicador "MODO RESGUARDO"]
```

### Secuencia Detallada

#### Paso 1 — Detección de Fallo

Se detecta un fallo cuando la API externa (NASA, USGS u Open-Meteo):

| Tipo de Fallo            | Detección                                    |
| ------------------------ | -------------------------------------------- |
| Timeout                  | Sin respuesta en $> 5000\text{ms}$           |
| Error HTTP               | Código de estado $5xx$                       |
| Rate-limit               | Código `429 Too Many Requests`               |
| Error de red             | `ConnectionError` / `DNS resolution failed`  |

#### Paso 2 — Activación Automática de Fallback

El backend FastAPI intercepta la excepción y ejecuta la cadena de resiliencia:

```python
@app.get("/api/fires")
async def get_fires(hours: int = 24) -> APIResponse:
    # Intento 1: Cache Redis
    cached = await redis.get(f"firms:{hours}h")
    if cached:
        return APIResponse.ok({**json.loads(cached), "cached": True})

    # Intento 2: API externa
    try:
        data = await fetch_firms_api(hours, timeout=5.0)
        await redis.setex(f"firms:{hours}h", 300, json.dumps(data))
        return APIResponse.ok(data)
    except (UpstreamUnavailable, RateLimited):
        pass

    # Intento 3: Dataset local estático (último recurso)
    fallback = load_local_geojson("data/fallback/firms_latest.json")
    return APIResponse.ok({**fallback, "fallback": True})
```

#### Paso 3 — Notificación en Interfaz

1. **Worker 1** procesa el dataset de resguardo de forma idéntica a los datos en vivo.
2. El HUD despliega una **etiqueta discreta de estado**:

   ```
   ┌──────────────────────────────────────┐
   │  ⚠ MODO RESGUARDO: DATOS EN CACHÉ   │
   │  Última actualización: hace 23 min   │
   └──────────────────────────────────────┘
   ```

3. La experiencia de usuario se mantiene **fluida e ininterrumpida** sin romper la simulación → **RNF-05**.

> [!IMPORTANT]
> La cadena de fallback tiene tres niveles de prioridad:
> 1. **Redis cache** (datos recientes, $< 20\text{ms}$ de latencia).
> 2. **API externa** (datos en tiempo real).
> 3. **GeoJSON local** (datos estáticos empaquetados con la app).
>
> El usuario siempre recibe datos, sin importar el estado de las APIs externas.

---

## Workflow 8: Ingesta, Normalización y Mapeo Radiológico (Safecast / EURDEP / GMCMap / RadNet)

**Requisitos vinculados:** RF-13, RF-14, RNF-01, RNF-03, RNF-04

### Diagrama de Flujo

```
[Activar Capa Radiación / Polling Auto]
        │
        ▼
[Frontend fetch → FastAPI Proxy]
        │
        ▼
[FastAPI: Consulta Safecast / EURDEP / RadNet / GMCMap + Redis Cache]
        │
        ▼
[Normalización a µSv/h en FastAPI Proxy (CPM → µSv/h)]
        │
        ▼
[Respuesta JSON (contrato universal) → Worker 1]
        │
        ▼
[Worker 1: Conversión Geodésica→Cartesiana + Asignación de Umbral/Color]
        │
        ▼
[Empaquetar Float32Array (posiciones + colores + niveles)]
        │
        ▼
[Transferable Objects → Hilo Principal (zero-copy)]
        │
        ▼
[Actualizar InstancedMesh / Heatmap Shader]
        │
        ▼
[GPU: Renderizado cromático + Alerta de Parpadeo si > 1.00 µSv/h]
```

### Secuencia Detallada

#### Paso 1 — Disparador

Activación del toggle de la **capa de radiación** en el HUD táctico o polling automático configurado.

#### Paso 2 — Proxy Backend y Conversión de Unidades (FastAPI)

1. El frontend invoca `GET /api/radiation?lat=35.67&lon=139.65&radius_km=50`.
2. FastAPI revisa **caché Redis** (TTL: 5 min).
3. En caso de cache miss, consulta **Safecast**, **EURDEP**, **EPA RadNet** o **GMCMap** según la cobertura geográfica disponible.
4. FastAPI **normaliza** lecturas dispersas en Cuentas Por Minuto ($\text{CPM}$) aplicando factores de calibración estándar de tubo Geiger para entregar un estándar unificado en $\mu\text{Sv/h}$:

$$\mu\text{Sv/h} \approx \frac{\text{CPM}}{334}$$

> Factor de conversión para Cs-137 / Cs-134 en sensores GQ típicos.

5. Retorna los datos en el [formato de contrato universal](./GAIA_API_CONTRACT.md) → **RF-13**.

```python
# FastAPI — Normalización de unidades radiológicas
def normalize_to_usvh(value: float, unit: str) -> float:
    if unit == "uSv/h":
        return value
    elif unit == "CPM":
        return value / 334.0  # Factor Cs-137 para sensores GQ
    elif unit == "nSv/h":
        return value / 1000.0
    else:
        raise ValueError(f"Unknown radiation unit: {unit}")
```

#### Paso 3 — Procesamiento Multihilo (Worker 1)

1. Se transfiere el payload al **Worker 1**.
2. Worker 1 calcula las posiciones 3D $(X, Y, Z)$ sobre la esfera del planeta.
3. Clasifica el **nivel de alerta** y asigna los componentes de color GLSL:

   | Tasa de Dosis ($\mu\text{Sv/h}$) | Nivel de Alerta | Color RGBA                             |
   | -------------------------------- | --------------- | -------------------------------------- |
   | $< 0.20$                         | `normal`        | Verde / Azul tenue `(0.2, 0.8, 0.4)`  |
   | $0.20 - 1.00$                    | `elevated`      | Amarillo / Naranja `(1.0, 0.7, 0.1)`  |
   | $> 1.00$                         | `critical`      | Rojo incandescente `(1.0, 0.1, 0.0)`  |

4. Empaqueta posiciones, niveles de radiación y colores en un `Float32Array` y lo envía al hilo principal mediante **Transferable Objects** (zero-copy) → **RNF-03**.

```typescript
// Dentro del Worker 1
const buffer = new Float32Array(count * 8); // x,y,z,r,g,b,usvh,alertLevel
// ... poblar buffer con datos normalizados ...
self.postMessage({ type: 'RADIATION_READY', buffer }, [buffer.buffer]);
```

#### Paso 4 — Renderizado GPU (Three.js & GLSL)

1. Se asigna el buffer al **InstancedMesh** o shader de **mapa de calor esférico**.
2. El shader GLSL de fragmentos aplica **pulsaciones animadas** o **efectos de parpadeo** a los sensores que exceden el umbral crítico de $1.00\ \mu\text{Sv/h}$ → **RF-14**.

```glsl
// Fragment Shader — Alerta radiológica con parpadeo (simplificado)
uniform float u_time;

varying float v_usvh;
varying vec3 v_color;

void main() {
  vec3 color = v_color;
  float alpha = 0.8;

  // Parpadeo para niveles críticos (> 1.0 µSv/h)
  if (v_usvh > 1.0) {
    float pulse = sin(u_time * 6.0) * 0.5 + 0.5; // 3 Hz
    color = mix(v_color, vec3(1.0, 1.0, 1.0), pulse * 0.4);
    alpha = mix(0.6, 1.0, pulse);
  }

  gl_FragColor = vec4(color, alpha);
}
```

> [!CAUTION]
> Al actualizar datos de radiación (cambio de filtro o polling), las geometrías y materiales anteriores deben liberarse con `dispose()` antes de reconstruir el InstancedMesh (RNF-04).

---

## Resumen: Matriz Workflow ↔ Requisitos

| Workflow | RF                | RNF                | Capa Primaria        |
| :------: | ----------------- | ------------------ | -------------------- |
| **W1**   | RF-01, RF-02      | RNF-01, RNF-06, RNF-07 | Renderizado GPU  |
| **W2**   | RF-03, RF-04      | RNF-02, RNF-03, RNF-04 | Workers + GPU    |
| **W3**   | RF-05, RF-06      | RNF-01, RNF-03         | Workers + GPU    |
| **W4**   | RF-07, RF-08      | RNF-02, RNF-03         | Workers + GPU    |
| **W5**   | RF-09, RF-10      | RNF-01                 | GPU (solo shaders)|
| **W6**   | RF-11, RF-12      | RNF-04                 | HUD + Workers    |
| **W7**   | —                 | RNF-05                 | Backend + Workers|
| **W8**   | RF-13, RF-14      | RNF-01, RNF-03, RNF-04 | Workers + GPU    |

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md), el [Stack Tecnológico](./GAIA_TECH_STACK.md) y el [Contrato de API](./GAIA_API_CONTRACT.md) del proyecto GAIA.*

