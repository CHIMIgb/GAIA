# GAIA — APIs de Textura Satelital, Elevación y Altimetría

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## Propósito

Este documento cataloga las APIs necesarias para construir el **globo terráqueo 3D fotorrealista** de GAIA: la textura visual satelital que cubre la esfera, los mosaicos de elevación que deforman la malla en la GPU, y las consultas puntuales de altitud para el panel de telemetría.

---

## Índice

| #   | Categoría                                          | APIs Catalogadas |
| --- | -------------------------------------------------- | :--------------: |
| 1   | [Imagen Satelital (Textura del Globo)](#1-apis-de-imagen-satelital-textura-del-globo)       | 4 |
| 2   | [Elevación y Terreno (Heightmaps / DEM)](#2-mosaicos-de-elevación-y-datos-de-terreno-heightmaps--dem-tiles) | 2 |
| 3   | [Consulta Puntual de Altitud (REST)](#3-apis-rest-de-consulta-de-altitud-puntual-metros-sobre-el-nivel-del-mar) | 3 |
| 4   | [Integración Recomendada](#4-integración-recomendada-para-gaia-3d)                          | — |

---

## 1. APIs de Imagen Satelital (Textura del Globo)

Estas APIs proveen **teselas (tiles) raster** en formato PNG/JPEG en proyecciones esféricas (EPSG:3857) para mapear sobre la geometría de la Tierra en Three.js / WebGL.

### 1.1 Esri World Imagery (ArcGIS) ⭐ Opción Principal

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Esri / ArcGIS Online                                                   |
| **Tipo de capa**     | Satélite óptico de alta resolución mundial                             |
| **URL de Teselas**   | `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| **Formato**          | JPEG (256×256 px por tile)                                             |
| **Autenticación**    | **Sin API Key obligatoria** (uso dev / no comercial)                   |
| **Límite gratuito**  | 100% gratuito para desarrollo y uso no comercial                       |
| **Cobertura**        | Global                                                                 |
| **Resolución máx.**  | ~0.3m (zonas urbanas), ~15m (zonas rurales)                            |

#### Uso en GAIA 3D

Opción ideal para prototipado y producción no comercial. Proporciona una capa global de imágenes satelitales que se mapea directamente sobre la `SphereGeometry` de Three.js como textura diffuse:

```typescript
// Carga de tile Esri como textura en Three.js
const tileUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const texture = new THREE.TextureLoader().load(tileUrl);
globeMaterial.map = texture;
```

#### Ventajas

- Sin API Key → cero fricción de integración.
- Alta resolución en zonas de interés (centros urbanos, zonas costeras).
- Disponibilidad 24/7 desde CDN de Esri.

---

### 1.2 Mapbox Satellite API

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Mapbox                                                                 |
| **Tipo de capa**     | Satélite ortocorregido y procesado                                     |
| **URL de Teselas**   | `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg?access_token={token}` |
| **Formato**          | JPEG / WebP (256×256 o 512×512 px)                                     |
| **Autenticación**    | Requiere `access_token` (registro gratuito)                            |
| **Límite gratuito**  | **50,000 cargas de mapa/mes** gratuitas                                |
| **Cobertura**        | Global                                                                 |
| **Resolución máx.**  | ~0.5m (zonas urbanas)                                                  |

#### Uso en GAIA 3D

Mosaico satelital continuo de alta resolución con **equilibrio de color** para evitar nubes y costuras en las imágenes:

- Mejor calidad visual que Esri en muchas regiones (procesamiento de color unificado).
- Tiles de 512×512 disponibles (menos peticiones, mejor calidad por tile).
- Requiere gestión del token en el backend (FastAPI proxy recomendado).

---

### 1.3 MapTiler Satellite

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | MapTiler                                                               |
| **Tipo de capa**     | Satélite global + Sentinel-2                                           |
| **URL de Teselas**   | `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={key}` |
| **Formato**          | JPEG / PNG (256×256 o 512×512 px)                                      |
| **Autenticación**    | Requiere API Key (registro gratuito)                                   |
| **Límite gratuito**  | **100,000 peticiones/mes** gratis                                      |
| **Cobertura**        | Global                                                                 |
| **Resolución máx.**  | ~10m (Sentinel-2), ~0.5m (zonas comerciales)                           |

#### Uso en GAIA 3D

Integra imágenes de satélites públicos (**Sentinel** y **Landsat**) actualizadas periódicamente:

- Bajo consumo de ancho de banda (tiles comprimidos).
- Actualización frecuente de imágenes (Sentinel-2 cada 5 días).
- Cuota gratuita generosa (100K/mes).

---

### 1.4 Google Maps Tile API

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Google Cloud Platform                                                  |
| **Tipo de capa**     | Ortoconstrucción satelital urbana y rural                              |
| **URL de Teselas**   | `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session={session}&key={key}` |
| **Formato**          | JPEG / PNG                                                             |
| **Autenticación**    | Requiere API Key vinculada a Google Cloud (**requiere tarjeta**)       |
| **Límite gratuito**  | **\$200 de crédito mensual** (~100,000 cargas de mapa)                  |
| **Cobertura**        | Global                                                                 |
| **Resolución máx.**  | ~0.15m (máxima resolución urbana disponible)                           |

#### Uso en GAIA 3D

Máxima resolución espacial urbana disponible en el mercado:

- Ideal si se necesita zoom extremo en zonas costeras o centros urbanos.
- Requiere billing activo en Google Cloud (barrera de entrada).
- Política de uso más restrictiva que las alternativas.

---

### Comparativa — Textura Satelital

| Característica           | Esri ⭐        | Mapbox          | MapTiler        | Google          |
| ------------------------ | :------------: | :-------------: | :-------------: | :-------------: |
| Sin API Key              | ✅             | ❌              | ❌              | ❌              |
| Sin tarjeta de crédito   | ✅             | ✅              | ✅              | ❌              |
| Cuota gratuita           | Ilimitada*     | 50K/mes         | 100K/mes        | \$200/mes        |
| Calidad de color         | ⚠️ Variable    | ✅ Unificada    | ✅ Buena        | ✅ Excelente    |
| Resolución máxima        | ~0.3m          | ~0.5m           | ~0.5m           | ~0.15m          |
| Tiles 512×512            | ❌             | ✅              | ✅              | ✅              |
| Facilidad de integración | ✅ Directa     | ⚠️ Token        | ⚠️ Key          | ❌ Compleja     |

> \* Uso no comercial / desarrollo.

---

## 2. Mosaicos de Elevación y Datos de Terreno (Heightmaps / DEM Tiles)

Para **deformar la malla 3D en la GPU** (Vertex Displacement) o calcular si una zona costera está sumergida, se utilizan teselas **Terrain-RGB** o **Terrarium**, donde el valor del color $(R, G, B)$ de cada píxel codifica los metros sobre el nivel del mar.

### 2.1 AWS Terrarium DEM (Open Data) ⭐ Opción Principal

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Mapzen / AWS Open Data Program                                         |
| **URL de Teselas**   | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` |
| **Formato**          | PNG RGB Tiles (256×256 px)                                             |
| **Autenticación**    | **Sin autenticación** (S3 Bucket público)                              |
| **Límite gratuito**  | Gratuito y abierto — sin restricciones                                 |
| **Cobertura**        | Global (tierra + batimetría)                                           |
| **Resolución**       | ~30m (zoom 15) a ~10km (zoom 0)                                       |
| **Rango de altitud** | -11,000m (fosas oceánicas) a +8,848m (Everest)                        |

#### Fórmula de Decodificación

$$\text{Elevación (m)} = (R \times 256 + G + B / 256) - 32768$$

#### Implementación GLSL (Vertex Shader)

```glsl
uniform sampler2D u_terrarium;
uniform float u_displacementScale;
uniform float u_globeRadius;

varying vec2 v_uv;

void main() {
  // Leer píxel RGB del heightmap
  vec4 texel = texture2D(u_terrarium, v_uv);

  // Decodificar elevación en metros
  float elevation = (texel.r * 256.0 * 256.0 + texel.g * 256.0 + texel.b) - 32768.0;

  // Desplazar vértice a lo largo de la normal
  float radius = u_globeRadius + elevation * u_displacementScale;
  vec3 displaced = normalize(position) * radius;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
```

#### Uso en GAIA 3D

Se carga la textura en el **Vertex Shader** para alterar el radio del globo $(R + \text{elevación})$ según las cordilleras o profundidades marinas:

1. Se descarga el tile PNG del S3 público de AWS.
2. Se sube a la GPU como `DataTexture`.
3. El vertex shader lee cada píxel, decodifica la elevación y desplaza el vértice.
4. Las montañas se extruyen hacia arriba, las fosas oceánicas hacia abajo.

> [!TIP]
> El formato Terrarium permite que **toda la decodificación ocurra en la GPU** sin procesamiento en JavaScript. Esto es clave para mantener 60 FPS (RNF-01).

---

### 2.2 Mapbox Terrain-RGB / Terrain-DEM

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Mapbox                                                                 |
| **URL de Teselas**   | `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token={token}` |
| **Formato**          | PNG RGB Tiles (512×512 px)                                             |
| **Autenticación**    | Requiere `access_token`                                                |
| **Límite gratuito**  | Incluido en la cuota gratuita de Mapbox (50,000 cargas/mes)            |
| **Cobertura**        | Global                                                                 |
| **Precisión**        | 0.1 metros por tono de color                                           |

#### Fórmula de Decodificación

$$\text{Elevación (m)} = -10000 + (R \times 256 \times 256 + G \times 256 + B) \times 0.1$$

#### Implementación GLSL (Vertex Shader)

```glsl
uniform sampler2D u_terrainRGB;

void main() {
  vec4 texel = texture2D(u_terrainRGB, v_uv);

  // Decodificar Mapbox Terrain-RGB
  float elevation = -10000.0 + (texel.r * 256.0 * 256.0 + texel.g * 256.0 + texel.b) * 0.1;

  vec3 displaced = normalize(position) * (u_globeRadius + elevation * u_scale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
```

#### Uso en GAIA 3D

- Mayor precisión (0.1m) que Terrarium para zonas costeras críticas.
- Tiles de 512×512 → menos peticiones, mejor calidad por tile.
- Requiere gestión del access token.

---

### Comparativa — Heightmaps / DEM

| Característica           | AWS Terrarium ⭐ | Mapbox Terrain-RGB |
| ------------------------ | :--------------: | :----------------: |
| Sin API Key              | ✅               | ❌                 |
| Precisión altimétrica    | ~1m              | **0.1m**           |
| Tamaño de tile           | 256×256          | 512×512            |
| Incluye batimetría       | ✅               | ⚠️ Parcial          |
| Cuota gratuita           | Ilimitada        | 50K cargas/mes     |
| Decodificación en GPU    | ✅               | ✅                 |

---

## 3. APIs REST de Consulta de Altitud Puntual (Metros sobre el Nivel del Mar)

Cuando el usuario hace clic sobre un punto del planeta o un evento ambiental (incendio o sismo), estas APIs permiten consultar en milisegundos la **altitud exacta en metros** enviando latitud y longitud.

### 3.1 Open-Meteo Elevation API ⭐ Opción Principal

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Open-Meteo (Open Source)                                               |
| **Endpoint**         | `https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}` |
| **Formato**          | JSON                                                                   |
| **Autenticación**    | **Sin API Key**                                                        |
| **Límite gratuito**  | Hasta **10,000 peticiones/día** (uso no comercial)                     |
| **Precisión**        | Basada en Copernicus DEM (30m de resolución)                           |
| **Latencia**         | ~50ms                                                                  |

#### Ejemplo de Petición y Respuesta

```
GET https://api.open-meteo.com/v1/elevation?latitude=27.9881&longitude=86.9250
```

```json
{
  "elevation": [8747.0]
}
```

#### Consulta por Lote (Múltiples Puntos)

```
GET https://api.open-meteo.com/v1/elevation?latitude=27.99,35.67,-12.45&longitude=86.93,139.72,-54.32
```

```json
{
  "elevation": [8747.0, 42.0, 312.0]
}
```

#### Uso en GAIA 3D

Se invoca desde **FastAPI (proxy)** cuando el usuario hace clic en un punto del globo o en un evento ambiental:

```python
# FastAPI — Proxy de elevación con caché
@app.get("/api/elevation")
async def get_elevation(lat: float, lon: float) -> APIResponse:
    cache_key = f"elev:{lat:.3f}:{lon:.3f}"
    cached = await redis.get(cache_key)
    if cached:
        return APIResponse.ok({"elevation_m": float(cached)})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}"
        )
        elevation = resp.json()["elevation"][0]
        await redis.setex(cache_key, 86400, str(elevation))  # TTL: 24h

    return APIResponse.ok({"elevation_m": elevation})
```

---

### 3.2 Elevation-API.eu

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | Elevation-API.eu (Europa)                                              |
| **Endpoint**         | `https://www.elevation-api.eu/v1/elevation/{lat}/{lon}`                |
| **Formato**          | JSON                                                                   |
| **Autenticación**    | **Sin registro**                                                       |
| **Límite gratuito**  | Hasta **10 peticiones/segundo** sin registro                           |
| **Precisión**        | Basada en Copernicus DEM (ESA)                                         |
| **Latencia**         | ~80ms                                                                  |

#### Uso en GAIA 3D

- Fuente alternativa de fallback si Open-Meteo no responde.
- Basada en el modelo DEM de la **Agencia Espacial Europea** (Copernicus).
- Útil como segunda opción en la cadena de resiliencia.

---

### 3.3 USGS Elevation Point Query Service

| Campo               | Detalle                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **Proveedor**        | U.S. Geological Survey                                                 |
| **Endpoint**         | `https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&wkid=4326&units=Meters` |
| **Formato**          | JSON                                                                   |
| **Autenticación**    | **Sin API Key**                                                        |
| **Límite gratuito**  | Sin restricciones documentadas                                         |
| **Precisión**        | Basada en 3DEP (~1m en EE.UU., ~30m global)                           |
| **Latencia**         | ~200ms                                                                 |

#### Ejemplo de Respuesta

```json
{
  "value": 1245.67,
  "x": -105.2705,
  "y": 40.0150
}
```

#### Uso en GAIA 3D

- API oficial del gobierno de EE.UU. para elevación precisa.
- Mayor precisión (~1m) dentro del territorio continental de EE.UU. (dataset 3DEP).
- Tercera opción en la cadena de fallback.

---

### Comparativa — Consulta Puntual de Altitud

| Característica           | Open-Meteo ⭐   | Elevation-API.eu | USGS EPQS        |
| ------------------------ | :-------------: | :--------------: | :---------------: |
| Sin API Key              | ✅              | ✅               | ✅                |
| Sin registro             | ✅              | ✅               | ✅                |
| Consulta por lote        | ✅              | ❌               | ❌                |
| Cobertura global         | ✅              | ✅               | ⚠️ (mejor en EE.UU.) |
| Latencia                 | ~50ms           | ~80ms            | ~200ms            |
| Cuota diaria             | 10,000          | 10 req/s         | Sin límite doc.   |
| Fuente DEM               | Copernicus 30m  | Copernicus 30m   | 3DEP ~1m (EE.UU.)|

---

## 4. Integración Recomendada para GAIA 3D

Para mantener la aplicación **gratuita, rápida y de alto rendimiento**, la combinación técnica recomendada es:

### Diagrama de Integración

```
┌─────────────────────────────┐      ┌───────────────────────────────┐
│   TEXTURA SATELITAL         │      │   TEXTURA DE ELEVACIÓN        │
│   Esri World Imagery ⭐     │      │   AWS Terrarium DEM ⭐        │
│   (JPEG tiles, sin API Key) │      │   (PNG RGB tiles, sin Key)    │
└──────────────┬──────────────┘      └──────────────┬────────────────┘
               │                                     │
               │     Descarga paralela de tiles       │
               │     según viewport / LOD             │
               └──────────────┬──────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │  THREE.JS — ShaderMaterial   │
               │                              │
               │  Vertex Shader:              │
               │    → Lee Terrarium PNG       │
               │    → Decodifica elevación    │
               │    → Desplaza vértices       │
               │                              │
               │  Fragment Shader:            │
               │    → Mapea textura Esri      │
               │    → Aplica iluminación      │
               │    → Efecto atmosférico      │
               └──────────────┬───────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │  INTERACCIÓN DEL USUARIO     │
               │                              │
               │  Clic en punto / evento      │
               │         │                    │
               │         ▼                    │
               │  FastAPI Proxy → Redis Cache │
               │         │                    │
               │         ▼                    │
               │  Open-Meteo Elevation API ⭐ │
               │  Respuesta: {elevation: Xm}  │
               │         │                    │
               │         ▼                    │
               │  Panel HUD: "Altitud: X m"   │
               └──────────────────────────────┘
```

### Resumen de la Combinación

| Capa                   | API Seleccionada         | Rol                                              | Costo  |
| ---------------------- | ------------------------ | ------------------------------------------------ | :----: |
| **Textura Satelital**  | Esri World Imagery ⭐    | Mapear imagen fotorrealista sobre la esfera       | Gratis |
| **Relieve 3D (DEM)**  | AWS Terrarium ⭐         | Deformar vértices de la malla según elevación     | Gratis |
| **Altitud Puntual**   | Open-Meteo Elevation ⭐  | Mostrar metros s.n.m. al hacer clic en el HUD    | Gratis |

> [!IMPORTANT]
> Las tres APIs seleccionadas como principales son **100% gratuitas y no requieren API Key**, lo que elimina toda fricción de configuración y dependencia de cuentas externas.

### Cadena de Fallback por Capa

| Capa               | Prioridad 1 ⭐      | Prioridad 2          | Prioridad 3          |
| ------------------- | :-----------------: | :------------------: | :------------------: |
| Textura Satelital   | Esri World Imagery  | MapTiler Satellite   | Mapbox Satellite     |
| Heightmap / DEM     | AWS Terrarium       | Mapbox Terrain-RGB   | GEBCO (estático)     |
| Altitud Puntual     | Open-Meteo          | Elevation-API.eu     | USGS EPQS            |

---

## 5. Notas Técnicas de Implementación

### 5.1 Carga de Tiles por Nivel de Detalle (LOD)

La aplicación no descarga todos los tiles del planeta de una vez. Se implementa un sistema de **Level of Detail** basado en la distancia de la cámara:

| Distancia de Cámara | Zoom Level | Tiles Cargados | Resolución Aprox. |
| -------------------- | :--------: | :------------: | :----------------: |
| Vista global         | 0–2        | 1–16           | ~10 km/px          |
| Continental          | 3–5        | ~64            | ~1 km/px           |
| Regional             | 6–8        | ~256           | ~100 m/px          |
| Local                | 9–12       | ~512           | ~10 m/px           |

### 5.2 Caché de Tiles en Frontend

```typescript
// Sistema de caché LRU para tiles descargados
class TileCache {
  private cache = new Map<string, THREE.Texture>();
  private maxSize = 512; // Máximo de tiles en memoria

  get(key: string): THREE.Texture | undefined {
    const tex = this.cache.get(key);
    if (tex) {
      // Mover al final (LRU)
      this.cache.delete(key);
      this.cache.set(key, tex);
    }
    return tex;
  }

  set(key: string, texture: THREE.Texture): void {
    if (this.cache.size >= this.maxSize) {
      // Evictar el tile más antiguo
      const oldest = this.cache.keys().next().value;
      this.cache.get(oldest)?.dispose(); // Liberar VRAM
      this.cache.delete(oldest);
    }
    this.cache.set(key, texture);
  }
}
```

### 5.3 Proyección de Coordenadas (Tile → UV → 3D)

Para mapear las teselas planas sobre la esfera 3D:

$$
\text{lon} = \frac{x}{2^z} \times 360 - 180
$$

$$
\text{lat} = \arctan\left(\sinh\left(\pi - \frac{2\pi \cdot y}{2^z}\right)\right) \times \frac{180}{\pi}
$$

Donde $(x, y, z)$ son las coordenadas del tile y $z$ es el nivel de zoom.

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md), el [Stack Tecnológico](./GAIA_TECH_STACK.md), el [Contrato de API](./GAIA_API_CONTRACT.md), los [Workflows](./GAIA_WORKFLOWS.md) y el [Catálogo de Fuentes de Datos](./GAIA_DATA_SOURCES.md) del proyecto GAIA.*
