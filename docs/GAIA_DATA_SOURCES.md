# GAIA — Catálogo de APIs y Fuentes de Datos

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## Índice por Módulo

| #   | Módulo                                          | APIs Catalogadas |
| --- | ----------------------------------------------- | :--------------: |
| 1   | [Incendios Forestales y Anomalías Térmicas](#1-módulo-de-incendios-forestales-y-anomalías-térmicas) | 3 |
| 2   | [Actividad Sísmica y Placas Tectónicas](#2-módulo-de-actividad-sísmica-y-placas-tectónicas)         | 4 |
| 3   | [Viento y Vectores Atmosféricos](#3-módulo-de-viento-y-vectores-atmosféricos)                       | 3 |
| 4   | [Elevación, Batimetría e Inundaciones](#4-módulo-de-elevación-batimetría-e-inundaciones-costeras)    | 4 |
| 5   | [Fuentes OSINT Complementarias](#5-fuentes-osint-complementarias-satélites-y-fronteras)             | 3 |
| 6   | [Radiación Ambiental y Riesgo Nuclear](#6-módulo-de-radiación-ambiental-y-riesgo-nuclear)           | 4 |

---

## 1. Módulo de Incendios Forestales y Anomalías Térmicas

> Requisitos vinculados: **RF-03, RF-04**

### 1.1 NASA FIRMS API ⭐ Opción Principal

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | NASA Goddard Space Flight Center (GSFC)                              |
| **URL Base**         | `https://firms.modaps.eosdis.nasa.gov/api/`                         |
| **Formatos**         | CSV, GeoJSON, KML                                                    |
| **Autenticación**    | Requiere `MAP_KEY` gratuita (registro en EARTHDATA)                  |
| **Límites**          | Gratuita sin cuotas estrictas. Uso razonable.                        |
| **Cobertura**        | Global                                                               |
| **Latencia**         | Near Real-Time (NRT) — datos disponibles ~3h después de captura      |

#### Instrumentos Disponibles

| Instrumento | Resolución | Identificador API |
| ----------- | :--------: | ----------------- |
| VIIRS (S-NPP) | 375 m    | `VIIRS_SNPP_NRT` |
| VIIRS (NOAA-20) | 375 m  | `VIIRS_NOAA20_NRT` |
| VIIRS (NOAA-21) | 375 m  | `VIIRS_NOAA21_NRT` |
| MODIS (Aqua/Terra) | 1 km | `MODIS_NRT`      |

#### Uso en GAIA 3D

Proporciona detecciones de anomalías térmicas con **Fire Radiative Power (FRP)** en $\text{MW/km}^2$. Los datos alimentan directamente el `InstancedMesh` del módulo de incendios:

- **Coordenadas** $(\text{lat}, \text{lon})$ → Posición 3D sobre la esfera.
- **FRP** → Escala de tamaño y gradiente de color (amarillo → rojo → blanco).
- **Brightness Temperature** → Tooltip de telemetría.
- **Confidence** → Filtrado de falsos positivos.

#### Ejemplo de Petición

```
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/world/1
```

#### Campos Clave de Respuesta

```csv
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,frp
-12.453,-54.321,342.5,0.39,0.36,2026-09-21,0130,N,high,28.7
```

---

### 1.2 EFFIS — European Forest Fire Information System

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Copernicus / Comisión Europea (JRC)                                  |
| **URL Base**         | `https://effis.jrc.ec.europa.eu/applications/data-and-services`      |
| **Formatos**         | WMS, WFS, GeoJSON                                                    |
| **Autenticación**    | Gratuito y abierto (sin API key para WFS público)                    |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Europa, Norte de África y Oriente Medio                              |

#### Uso en GAIA 3D

Ideal para **enriquecer áreas europeas** con datos complementarios a NASA FIRMS:

- **Índice de Peligro de Incendio (FWI):** Fire Weather Index calculado por ECMWF.
- **Áreas Quemadas (Burned Areas):** Polígonos delimitando zonas ya consumidas por el fuego.
- **Perímetros activos:** Límites de incendios en curso.

#### Servicios Disponibles

| Servicio                     | Protocolo | Descripción                                      |
| ---------------------------- | --------- | ------------------------------------------------ |
| Current Situation Viewer     | WMS/WFS   | Incendios activos y áreas quemadas en tiempo real |
| Fire Danger Forecast         | WMS       | Mapa de índice de peligro de incendio (FWI)      |
| MODIS Burned Areas           | WFS       | Polígonos de áreas quemadas históricas           |

---

### 1.3 Global Forest Watch (GFW) API

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | World Resources Institute (WRI)                                      |
| **URL Base**         | `https://data-api.globalforestwatch.org/`                            |
| **Formatos**         | JSON, REST API                                                       |
| **Autenticación**    | Gratuita mediante registro de desarrollador                          |
| **Límites**          | Rate-limiting estándar por token                                     |
| **Cobertura**        | Global                                                               |

#### Uso en GAIA 3D

Ofrece **datos históricos** de alertas de deforestación y parches de incendios acumulados:

- **GLAD Alerts:** Alertas semanales de pérdida de cobertura forestal.
- **VIIRS Fire Alerts:** Integración propia de datos FIRMS con contexto forestal.
- **Tree Cover Loss:** Datos anuales de pérdida de bosque por región.

> [!TIP]
> GFW complementa a FIRMS proporcionando **contexto ecológico**: no solo dónde hay fuego, sino cuánto bosque se ha perdido históricamente en esa zona.

---

### Comparativa — Módulo de Incendios

| Característica           | NASA FIRMS ⭐ | EFFIS           | GFW               |
| ------------------------ | :-----------: | :-------------: | :----------------: |
| Cobertura global         | ✅            | ❌ (Europa)     | ✅                 |
| Datos en tiempo real     | ✅ (NRT ~3h)  | ✅              | ⚠️ (semanal)       |
| FRP disponible           | ✅            | ❌              | ❌                 |
| Áreas quemadas           | ❌            | ✅              | ✅                 |
| Índice de peligro        | ❌            | ✅ (FWI)        | ❌                 |
| Sin API Key              | ❌            | ✅              | ❌                 |

---

## 2. Módulo de Actividad Sísmica y Placas Tectónicas

> Requisitos vinculados: **RF-07, RF-08**

### 2.1 USGS Earthquake API ⭐ Opción Principal

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | U.S. Geological Survey                                               |
| **URL Base**         | `https://earthquake.usgs.gov/fdsnws/event/1/`                        |
| **Formatos**         | GeoJSON, CSV, QuakeML, KML                                          |
| **Autenticación**    | Totalmente abierta, **sin API Key**                                  |
| **Límites**          | Peticiones ilimitadas razonables                                     |
| **Cobertura**        | Global                                                               |
| **Latencia**         | Feeds actualizados cada minuto                                       |

#### Feeds Precompilados Disponibles

| Feed                                | URL                                                                    | Intervalo      |
| ----------------------------------- | ---------------------------------------------------------------------- | -------------- |
| Sismos significativos (última hora) | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson` | Última hora    |
| Todos M2.5+ (24 horas)             | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`    | Últimas 24h    |
| Todos M4.5+ (7 días)               | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson`   | Últimos 7 días |
| Todos M4.5+ (30 días)              | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson`  | Últimos 30 días|

#### Uso en GAIA 3D

Proporciona **magnitud, profundidad hipocentral y coordenadas** $(x, y, z)$ para cada evento:

- **Magnitud** → Radio del cilindro 3D (escala de Richter).
- **Profundidad (km)** → Altura del cilindro extruido.
- **Coordenadas** $(\text{lat}, \text{lon})$ → Posición 3D.
- **Timestamp** → Disparador de animación de ondas de choque (si $< 2\text{h}$).

#### Ejemplo de Petición con Query

```
GET https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2026-09-20&minmagnitude=4.5
```

#### Estructura de Respuesta (GeoJSON Feature)

```json
{
  "type": "Feature",
  "properties": {
    "mag": 5.1,
    "place": "82 km SE of Tokyo, Japan",
    "time": 1790000000000,
    "depth": 42.3,
    "tsunami": 0,
    "sig": 400,
    "type": "earthquake"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [139.72, 35.67, 42.3]
  }
}
```

---

### 2.2 EMSC Web Services

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | European-Mediterranean Seismological Centre (CSEM)                   |
| **URL Base**         | `https://www.seismicportal.eu/fdsnws/event/1/`                       |
| **Formatos**         | GeoJSON, WebSocket, FDSNWS                                          |
| **Autenticación**    | Gratuita y pública                                                   |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Global (énfasis Euro-Mediterráneo)                                   |

#### Uso en GAIA 3D

Excelente opción para recibir **alertas sísmicas globales en tiempo real vía WebSocket** sin hacer polling:

```javascript
const ws = new WebSocket('wss://www.seismicportal.eu/standing_order/websocket');
ws.onmessage = (event) => {
  const quake = JSON.parse(event.data);
  // Disparar renderizado de nueva columna + onda de choque
};
```

> [!TIP]
> Combinar **USGS (polling de feeds cada minuto)** con **EMSC (WebSocket en tiempo real)** permite tener una cobertura de datos sísmica robusta y de baja latencia sin perder eventos.

---

### 2.3 FDSN Event Web Service (IRIS / EarthScope)

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | EarthScope / IRIS Consortium                                         |
| **URL Base**         | `https://service.iris.edu/fdsnws/event/1/`                           |
| **Formatos**         | GeoJSON, QuakeML, XML                                                |
| **Autenticación**    | Gratuito y abierto                                                   |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Global                                                               |

#### Uso en GAIA 3D

Proporciona **waveforms sísmicos y catálogos históricos globales** de alta precisión:

- Catálogos históricos para análisis de tendencias.
- Datos de formas de onda para investigación avanzada.
- Alternativa de fallback si USGS no responde.

---

### 2.4 PB2002 Tectonic Plates Dataset

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Peter Bird (UCLA) / GitHub OSINT                                     |
| **URL Base**         | `https://github.com/fraxen/tectonicplates`                           |
| **Formatos**         | GeoJSON, TopoJSON                                                    |
| **Autenticación**    | Archivo estático Open Data                                           |
| **Licencia**         | Dominio público                                                      |
| **Cobertura**        | Global                                                               |

#### Uso en GAIA 3D

Define las **fronteras de las placas tectónicas globales** para renderizarlas como líneas GLSL sobre la corteza del globo:

- 15 placas tectónicas principales.
- Fronteras convergentes, divergentes y transformantes.
- Datos estáticos — se empaquetan directamente en el build.

```
Archivos incluidos:
├── PB2002_boundaries.json    ← Líneas de frontera entre placas
├── PB2002_plates.json        ← Polígonos de cada placa
├── PB2002_orogens.json       ← Zonas orogénicas (colisión)
└── PB2002_steps.json         ← Segmentos individuales
```

---

### Comparativa — Módulo Sísmico

| Característica           | USGS ⭐       | EMSC            | IRIS            | PB2002          |
| ------------------------ | :-----------: | :-------------: | :-------------: | :-------------: |
| Tiempo real              | ✅ (~1 min)   | ✅ (WebSocket)  | ⚠️ (consulta)   | N/A (estático)  |
| Sin API Key              | ✅            | ✅              | ✅              | ✅              |
| Profundidad hipocentral  | ✅            | ✅              | ✅              | ❌              |
| Placas tectónicas        | ❌            | ❌              | ❌              | ✅              |
| WebSocket nativo         | ❌            | ✅              | ❌              | ❌              |
| Catálogos históricos     | ✅            | ✅              | ✅              | ❌              |

---

## 3. Módulo de Viento y Vectores Atmosféricos

> Requisitos vinculados: **RF-05, RF-06**

### 3.1 Open-Meteo Weather API ⭐ Opción Principal

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Open-Meteo (Open Source)                                             |
| **URL Base**         | `https://api.open-meteo.com/v1/forecast`                             |
| **Formatos**         | JSON, Binary FlatBuffers                                             |
| **Autenticación**    | **Sin API Key** (uso no comercial)                                   |
| **Límites**          | Hasta 10,000 peticiones/día (sin key)                                |
| **Cobertura**        | Global                                                               |
| **Resolución**       | ~11 km (0.1°)                                                        |

#### Parámetros de Viento Disponibles

| Parámetro                     | Unidad | Altitud      | Descripción                           |
| ----------------------------- | :----: | :----------: | ------------------------------------- |
| `wind_speed_10m`              | km/h   | 10 m         | Velocidad del viento a 10 metros      |
| `wind_direction_10m`          | °      | 10 m         | Dirección del viento a 10 metros      |
| `wind_speed_80m`              | km/h   | 80 m         | Velocidad a nivel de turbina eólica   |
| `wind_direction_80m`          | °      | 80 m         | Dirección a nivel de turbina eólica   |
| `windspeed_100hPa`            | km/h   | ~16 km       | Viento en alta troposfera             |
| `winddirection_100hPa`        | °      | ~16 km       | Dirección en alta troposfera          |

#### Uso en GAIA 3D

Retorna componentes de viento $U$ y $V$ a diferentes altitudes. Su respuesta en FlatBuffers/JSON es rápida de procesar en el **Worker 3**:

1. El Worker 3 descarga la rejilla de viento.
2. Calcula $U = \text{speed} \cdot \cos(\text{dir})$ y $V = \text{speed} \cdot \sin(\text{dir})$.
3. Empaqueta en `DataTexture` para el GPU Particle System.

#### Ejemplo de Petición

```
GET https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&hourly=wind_speed_10m,wind_direction_10m&format=flatbuffers
```

---

### 3.2 NOAA GFS en AWS Open Data

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | NOAA / AWS Open Data Program                                         |
| **URL Base**         | `s3://noaa-gfs-bdp-pds/` (S3 Bucket público)                        |
| **Formatos**         | GRIB2, NetCDF                                                        |
| **Autenticación**    | Gratuito (almacenado en S3 público de Amazon)                        |
| **Límites**          | Sin restricciones (es almacenamiento S3 público)                     |
| **Cobertura**        | Global                                                               |
| **Resolución**       | 0.25° (~28 km)                                                       |

#### Uso en GAIA 3D

Descarga de bloques binarios del modelo **Global Forecast System (GFS)**:

- Resolución global 0.25° con pronósticos cada 6 horas.
- Componentes $U$ y $V$ del viento a múltiples niveles de presión.
- **Requiere decodificación GRIB2** — se puede hacer en:
  - Worker con librería JavaScript (ej: `grib2js`).
  - Backend FastAPI con `cfgrib` / `xarray` en Python.
  - WebAssembly compilado desde `eccodes` (C).

> [!NOTE]
> Los archivos GRIB2 del GFS son pesados (50-200 MB por ciclo de pronóstico). Se recomienda que **FastAPI descargue, recorte las variables de viento y sirva solo los ArrayBuffers necesarios** al frontend.

---

### 3.3 ECMWF Open Data API

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | European Centre for Medium-Range Weather Forecasts                   |
| **URL Base**         | `https://data.ecmwf.int/forecasts/`                                  |
| **Formatos**         | GRIB2, NetCDF                                                        |
| **Autenticación**    | Gratuito y abierto (licencia CC-BY 4.0)                              |
| **Límites**          | Sin restricciones estrictas                                          |
| **Cobertura**        | Global                                                               |
| **Resolución**       | 0.4° (~44 km) para datos abiertos                                   |

#### Uso en GAIA 3D

Proporciona pronósticos globales de alta resolución del **modelo europeo IFS** (Integrated Forecasting System):

- Considerado el modelo de pronóstico más preciso del mundo.
- Componentes de viento $U_{10}$ y $V_{10}$ (a 10m de superficie).
- Alternativa de alta calidad a NOAA GFS.

---

### Comparativa — Módulo de Viento

| Característica          | Open-Meteo ⭐  | NOAA GFS        | ECMWF           |
| ----------------------- | :------------: | :-------------: | :-------------: |
| Facilidad de uso        | ✅ (JSON/REST) | ⚠️ (GRIB2 binario) | ⚠️ (GRIB2 binario) |
| Sin API Key             | ✅             | ✅              | ✅              |
| Sin decodificación GRIB | ✅             | ❌              | ❌              |
| Resolución              | ~11 km         | ~28 km          | ~44 km          |
| Formato liviano         | ✅ FlatBuffers | ❌ (50-200 MB)  | ❌ (archivos pesados) |
| Precisión del modelo    | ⚠️ (mezcla)    | ✅ (GFS)        | ✅ (IFS — mejor)|

---

## 4. Módulo de Elevación, Batimetría e Inundaciones Costeras

> Requisitos vinculados: **RF-02, RF-09, RF-10**

### 4.1 AWS Terrarium / Mapbox RGB Tiles ⭐ Opción Principal

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Mapzen / AWS Open Data                                               |
| **URL Base**         | `s3://elevation-tiles-prod/terrarium/`                               |
| **Formatos**         | PNG RGB Tiles (esquema TMS / Slippy Map)                             |
| **Autenticación**    | Gratuita (S3 Bucket público de AWS)                                  |
| **Límites**          | Sin restricciones                                                    |
| **Cobertura**        | Global                                                               |
| **Resolución**       | ~30m (zoom 15) a ~10km (zoom 0)                                     |

#### Fórmula de Decodificación de Elevación

Los píxeles PNG codifican la altitud en milímetros:

$$\text{Elevación (m)} = (R \times 256 + G + B / 256) - 32768$$

#### Uso en GAIA 3D

La GPU lee esta textura **directamente** para el vertex displacement:

1. Se descarga el tile PNG correspondiente al nivel de zoom.
2. Se sube a la GPU como textura.
3. El vertex shader decodifica la elevación por píxel y desplaza los vértices de la malla.

```glsl
// Decodificación Terrarium en GLSL
vec4 texel = texture2D(u_terrarium, v_uv);
float elevation = (texel.r * 256.0 * 256.0 + texel.g * 256.0 + texel.b) - 32768.0;
vec3 displaced = position + normal * elevation * u_scale;
```

> [!TIP]
> Esta es la fuente más eficiente para GAIA porque el formato PNG RGB se carga directamente como textura WebGL sin necesidad de decodificación en JavaScript. La GPU hace todo el trabajo.

---

### 4.2 GEBCO Grid Data

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | General Bathymetric Chart of the Oceans (GEBCO / IHO-IOC)           |
| **URL Base**         | `https://www.gebco.net/data_and_products/gridded_bathymetry_data/`   |
| **Formatos**         | GeoTIFF, NetCDF                                                      |
| **Autenticación**    | Descarga estática libre                                              |
| **Licencia**         | Libre con atribución                                                 |
| **Cobertura**        | Global (océanos + tierra)                                            |
| **Resolución**       | 15 arc-seconds (~450m)                                               |

#### Uso en GAIA 3D

Proporciona el **mapa batimétrico mundial de mayor calidad**:

- Mapeo de fosas oceánicas y relieve submarino (ej. Fosa de las Marianas).
- Datos complementarios a Terrarium para la capa oceánica del globo.
- Se pre-procesa en FastAPI (Python con `rasterio`/`numpy`) y se sirve como heightmap optimizado.

---

### 4.3 Copernicus DEM (GLO-30)

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Agencia Espacial Europea (ESA) / Copernicus                         |
| **URL Base**         | `https://dataspace.copernicus.eu/`                                   |
| **Formatos**         | GeoTIFF, Cloud-Optimized GeoTIFF (COG)                              |
| **Autenticación**    | Gratuito previo registro en Copernicus Data Space                    |
| **Límites**          | Sin restricciones post-registro                                      |
| **Cobertura**        | Global                                                               |
| **Resolución**       | **30 metros**                                                        |

#### Uso en GAIA 3D

Modelo Digital de Elevación (DEM) de **30 metros de resolución global**:

- Ideal para extraer **recortes de precisión costera** en el módulo de inundación.
- Permite determinar con exactitud qué áreas quedan sumergidas al elevar el nivel del mar ($+0\text{m}$ a $+10\text{m}$).
- Se pre-procesa en FastAPI: recorte por bounding box → conversión a heightmap PNG → envío al frontend.

---

### 4.4 NOAA Tides & Currents API

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | National Oceanic and Atmospheric Administration (NOAA)               |
| **URL Base**         | `https://api.tidesandcurrents.noaa.gov/api/prod/`                    |
| **Formatos**         | JSON, XML                                                            |
| **Autenticación**    | Gratuita **sin API Key**                                             |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Estaciones costeras globales (mayor densidad en EE.UU.)              |

#### Uso en GAIA 3D

Proporciona datos de **estaciones mareográficas en tiempo real** y tendencias del aumento del nivel del mar:

- Nivel del agua actual en estaciones costeras.
- Predicciones de marea alta/baja.
- Tendencia de aumento del nivel del mar (mm/año) por estación.
- Complementa el slider de inundación con datos reales de marea.

#### Ejemplo de Petición

```
GET https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20260920&end_date=20260921&station=8518750&product=water_level&datum=MLLW&units=metric&format=json
```

---

### Comparativa — Módulo de Elevación / Inundación

| Característica          | Terrarium ⭐   | GEBCO           | Copernicus DEM  | NOAA Tides      |
| ----------------------- | :------------: | :-------------: | :-------------: | :-------------: |
| Lectura directa en GPU  | ✅ (PNG)       | ❌ (GeoTIFF)    | ❌ (GeoTIFF)    | N/A             |
| Batimetría oceánica     | ⚠️ (limitada)  | ✅ (mejor)      | ❌ (solo tierra)| ❌              |
| Resolución costera      | ~30m           | ~450m           | **30m** (mejor) | Puntual         |
| Sin registro            | ✅             | ✅              | ❌              | ✅              |
| Datos en tiempo real     | ❌             | ❌              | ❌              | ✅ (mareas)     |

---

## 5. Fuentes OSINT Complementarias (Satélites y Fronteras)

### 5.1 CelesTrak TLE Data

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | CelesTrak (Dr. T.S. Kelso)                                          |
| **URL Base**         | `https://celestrak.org/NORAD/elements/`                              |
| **Formatos**         | TXT (TLE), JSON, CSV, XML                                           |
| **Autenticación**    | Gratuito **sin API Key**                                             |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Todos los objetos en órbita terrestre catalogados                    |

#### Uso en GAIA 3D

Permite **rastrear satélites ambientales** sobrevolando las áreas afectadas:

| Satélite        | Grupo TLE              | Propósito                              |
| --------------- | ---------------------- | -------------------------------------- |
| Sentinel-1/2    | `earth-resources`      | Imágenes SAR y multiespectrales        |
| NOAA-20/21      | `weather`              | Instrumento VIIRS (fuente de FIRMS)    |
| Suomi NPP       | `weather`              | VIIRS + CrIS                           |
| Landsat 8/9     | `earth-resources`      | Imágenes ópticas de resolución media   |
| Terra / Aqua    | `earth-resources`      | Instrumento MODIS (fuente de FIRMS)    |

#### Ejemplo de Petición

```
GET https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json
```

> [!NOTE]
> Los TLE (Two-Line Elements) permiten calcular la posición orbital en tiempo real usando la librería `satellite.js` directamente en el frontend, sin backend.

---

### 5.2 Natural Earth Vector Data

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Natural Earth (proyecto colaborativo)                                |
| **URL Base**         | `https://www.naturalearthdata.com/downloads/`                        |
| **Formatos**         | GeoJSON, Shapefile, TopoJSON                                        |
| **Autenticación**    | Archivo estático — **dominio público**                               |
| **Cobertura**        | Global                                                               |

#### Escalas Disponibles

| Escala     | Resolución       | Uso recomendado                        |
| ---------- | ---------------- | -------------------------------------- |
| 1:110m     | Baja             | Vista global del globo (zoom out)      |
| 1:50m      | Media            | Navegación continental                 |
| 1:10m      | Alta             | Zoom a nivel de país                   |

#### Uso en GAIA 3D

Proporciona **fronteras internacionales, líneas de costa y límites urbanos** simplificados para no recargar el renderizador:

- **Fronteras de países** → Líneas GLSL sobre la corteza.
- **Líneas de costa** → Demarcación tierra/agua.
- **Ciudades principales** → Labels de referencia geográfica.
- **Lagos y ríos** → Detalle geográfico complementario.

> [!TIP]
> Los datos de Natural Earth se empaquetan como archivos estáticos en el build de Webpack. No requieren peticiones de red en tiempo de ejecución.

---

### 5.3 OpenStreetMap / Overpass API

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | OSM Foundation                                                       |
| **URL Base**         | `https://overpass-api.de/api/interpreter`                            |
| **Formatos**         | OSM JSON, GeoJSON (vía wrapper)                                     |
| **Autenticación**    | Gratuito con límites de frecuencia por IP                            |
| **Límites**          | ~10,000 peticiones/día (por IP), máx 2 concurrentes                  |
| **Cobertura**        | Global                                                               |

#### Uso en GAIA 3D

Permite extraer **infraestructura crítica** cercana a zonas de desastre:

| Tipo de Infraestructura | Query Overpass                                     |
| ----------------------- | -------------------------------------------------- |
| Aeropuertos             | `node["aeroway"="aerodrome"]`                      |
| Puertos                 | `node["harbour"="yes"]`                            |
| Hospitales              | `node["amenity"="hospital"]`                       |
| Plantas de energía      | `way["power"="plant"]`                             |
| Estaciones de bomberos  | `node["amenity"="fire_station"]`                   |

#### Ejemplo de Query Overpass

```
[out:json][timeout:25];
(
  node["amenity"="hospital"](around:50000, -12.45, -54.32);
);
out body;
```

> [!WARNING]
> La Overpass API tiene límites estrictos por IP. Las consultas deben hacerse a través de **FastAPI con caché Redis** para evitar bloqueos. Nunca hacer peticiones directas desde el frontend en un bucle.

---

## 6. Módulo de Radiación Ambiental y Riesgo Nuclear

> Requisitos vinculados: **RF-13, RF-14**

### 6.1 Safecast API ⭐ Opción Principal OSINT

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Safecast Project (CC0 Public Domain)                                 |
| **URL Base**         | `https://api.safecast.org/measurements.json`                         |
| **Formatos**         | JSON / REST                                                          |
| **Autenticación**    | **Sin API Key** ni registro                                          |
| **Límites**          | Gratuita e ilimitada                                                 |
| **Licencia**         | Dominio Público (CC0)                                                |
| **Cobertura**        | Global (mayor densidad en Japón, Europa y EE.UU.)                    |

#### Descripción

La red abierta de monitoreo radiológico impulsada por la ciudadanía más grande del mundo, creada tras el desastre nuclear de Fukushima en 2011. Cuenta con miles de sensores fijos y móviles que transmiten lecturas continuas.

#### Uso en GAIA 3D

Devuelve arrays de mediciones geoespaciales con latitud, longitud, valor radiológico, unidad ($\mu\text{Sv/h}$ o $\text{CPM}$) y timestamp.

#### Ejemplo de Petición

```
GET https://api.safecast.org/measurements.json?latitude=35.6762&longitude=139.6503&distance=5000
```

---

### 6.2 EPA RadNet API (Estados Unidos)

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | U.S. Environmental Protection Agency (EPA)                           |
| **URL Base**         | `https://www.epa.gov/radnet` / Envirofacts REST API                  |
| **Formatos**         | JSON / XML                                                           |
| **Autenticación**    | Gratuita y abierta                                                   |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Estados Unidos (>140 estaciones continuas de monitoreo gamma)        |

#### Descripción

La red nacional de monitoreo de radiación ambiental de la Agencia de Protección Ambiental de EE. UU. Medidores automáticos en más de 140 puntos transmiten continuamente lecturas de radiación gamma en el aire.

#### Uso en GAIA 3D

Proporciona cobertura densa del territorio continental de EE.UU. con mediciones oficiales de radiación gamma ambiental. Complementa a Safecast con datos institucionales validados.

---

### 6.3 EURDEP / JRC REMON (Unión Europea)

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | Comisión Europea — Joint Research Centre (JRC)                       |
| **URL Base**         | `https://remon.jrc.ec.europa.eu/`                                    |
| **Formatos**         | GeoJSON / WFS                                                        |
| **Autenticación**    | Gratuito para acceso público                                         |
| **Límites**          | Sin restricciones documentadas                                       |
| **Cobertura**        | Europa (>30 países integrados en tiempo casi real)                   |

#### Descripción

European Radiological Data Exchange Platform, operada por la Comisión Europea (JRC). Agrega en tiempo casi real el intercambio automático de dosis radiológicas gamma desde las redes nacionales de monitoreo de más de 30 países europeos.

#### Uso en GAIA 3D

Ideal para mostrar mapas de intensidad de tasa de dosis equivalente ambiental sobre el continente europeo. Complementa a Safecast proporcionando datos oficiales de redes gubernamentales europeas.

---

### 6.4 GMCMap API (Red de Contadores Geiger Conectados)

| Campo               | Detalle                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Proveedor**        | GQ Electronics / Red Ciudadana GMCMap                                |
| **URL Base**         | `http://www.gmcmap.com/api/`                                         |
| **Formatos**         | JSON / CSV                                                           |
| **Autenticación**    | Requiere ID de consulta pública simple                               |
| **Límites**          | Sin costo                                                            |
| **Cobertura**        | Global (estaciones personales IoT 24/7)                              |

#### Descripción

Mapa interactivo colaborativo global alimentado por miles de estaciones de contadores Geiger personales (modelos GQ Electronics y compatibles) conectados a internet las 24 horas.

#### Uso en GAIA 3D

Permite obtener feeds en tiempo real de contadores de radiación distribuidos en ciudades de todo el mundo. Los datos se expresan nativamente en $\text{CPM}$ y se convierten a $\mu\text{Sv/h}$ en el proxy FastAPI.

---

### Comparativa — Módulo de Radiación

| Característica           | Safecast ⭐    | EPA RadNet      | EURDEP          | GMCMap          |
| ------------------------ | :------------: | :-------------: | :-------------: | :-------------: |
| Cobertura global         | ✅             | ❌ (EE.UU.)     | ❌ (Europa)     | ✅              |
| Sin API Key / ID         | ✅             | ✅              | ✅              | ⚠️ (ID query)   |
| Estaciones fijas vs móviles | Ambas       | Fijas           | Fijas           | Fijas (IoT)     |
| Unidades nativas         | $\mu\text{Sv/h}$ / $\text{CPM}$ | $\mu\text{Sv/h}$ / Gamma | Rate dosis ($\mu\text{Sv/h}$) | $\text{CPM}$ |
| Tiempo real              | ✅             | ✅              | ✅ (~NRT)       | ✅              |
| Licencia abierta         | ✅ (CC0)       | ✅              | ✅              | ✅              |

---

## 7. Matriz Resumen: Módulo ↔ APIs

| Módulo                 | API Principal ⭐              | APIs Complementarias                              |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| **Incendios**          | NASA FIRMS                    | EFFIS, Global Forest Watch                        |
| **Sismos**             | USGS Earthquake API           | EMSC (WebSocket), IRIS, PB2002 (placas)           |
| **Viento**             | Open-Meteo                    | NOAA GFS (GRIB2), ECMWF Open Data                |
| **Elevación/Inundación** | AWS Terrarium (RGB Tiles)   | GEBCO (batimetría), Copernicus DEM, NOAA Tides    |
| **OSINT/Contexto**     | Natural Earth                 | CelesTrak (satélites), OpenStreetMap (infra)      |
| **Radiación Ambiental**| Safecast API                  | EURDEP, EPA RadNet, GMCMap                        |

---

## 8. Estrategia de Fallback por Módulo

Cada módulo sigue la cadena de resiliencia definida en el [Workflow 7](./GAIA_WORKFLOWS.md#workflow-7-resiliencia-y-manejo-de-fallos-data-fallback):

| Módulo       | Prioridad 1 (API principal) | Prioridad 2 (Alternativa)   | Prioridad 3 (Local)                    |
| ------------ | :-------------------------: | :-------------------------: | :-------------------------------------: |
| Incendios    | NASA FIRMS                  | EFFIS / GFW                 | `fallback/firms_latest.json`            |
| Sismos       | USGS                        | EMSC                        | `fallback/quakes_latest.json`           |
| Viento       | Open-Meteo                  | NOAA GFS (vía FastAPI)      | `fallback/wind_grid_latest.bin`         |
| Elevación    | AWS Terrarium               | Copernicus DEM              | `fallback/heightmap_global.png`         |
| Radiación    | Safecast API                | EURDEP / GMCMap             | `fallback/radiation_latest.json`        |

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md), el [Stack Tecnológico](./GAIA_TECH_STACK.md), el [Contrato de API](./GAIA_API_CONTRACT.md) y los [Workflows](./GAIA_WORKFLOWS.md) del proyecto GAIA.*

