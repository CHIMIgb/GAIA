# GAIA — Especificación Técnica y Requisitos del Sistema

> **Nombre del Proyecto:** GAIA  
> **Versión del Documento:** 1.1  
> **Fecha:** 2026-09-22  

---

## 1. Visión General

GAIA es una aplicación de visualización geoespacial 3D en tiempo real que integra múltiples fuentes de datos ambientales — incendios, actividad sísmica, corrientes de viento, inundaciones costeras y radiación ambiental — sobre un globo terráqueo interactivo renderizado con WebGL/Three.js.

El sistema está diseñado para ofrecer una experiencia analítica táctica: un panel de control unificado donde científicos, analistas de desastres y ciudadanos puedan explorar, filtrar y comprender fenómenos naturales a escala planetaria con rendimiento de 60 FPS.

---

## 2. Bases Arquitectónicas del Sistema

La arquitectura de GAIA se divide en **cuatro capas** acopladas mediante **eventos asíncronos** y **estructuras de datos binarias**.

### 2.1 Diagrama de Capas

```
+-------------------------------------------------------------------------------------+
|                              CAPA DE DATOS ABIERTOS                                 |
| NASA FIRMS | USGS | Open-Meteo | GEBCO | Safecast / EURDEP / RadNet / GMCMap        |
+--------------------------------------+----------------------------------------------+
                                       | (API Fetch / GeoJSON / Binary GRIB2)
                                       v
+-------------------------------------------------------------------------------------+
|                        CAPA DE COMPUTACIÓN (WEB WORKERS)                            |
|  - Worker 1: Ingesta, Normalización (incendios, sismos, radiación) y Spatial Hashing|
|  - Worker 2: Particionado Espacial (Octree 3D para Alertas de Proximidad)           |
|  - Worker 3: Decodificador de Vectores de Viento (GRIB2 / ArrayBuffers)             |
+--------------------------------------+----------------------------------------------+
                                       | (Transferable Objects / SharedArrayBuffer)
                                       v
+-------------------------------------------------------------------------------------+
|                        CAPA DE RENDERIZADO GPU (THREE.JS)                           |
|  - Fire Module: InstancedMesh + FRP Color Gradient                                  |
|  - Wind Module: GPU Particle System (Transform Feedback / Compute Shader)           |
|  - Seismic Module: Extruded Cylinder Geometries + Wave Displace Shaders             |
|  - Ocean Module: Heightmap Displacement + Translucent Water Shader                  |
|  - Radiation Module: InstancedMesh / Heatmap Shader + Chromatic Alert Shader        |
+--------------------------------------+----------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------------+
|                          CAPA DE INTERFAZ TÁCTICA (HUD)                             |
|  Dashboard React/DOM, Controles de Capas, Time-Scrubber y Feed de Alertas           |
+-------------------------------------------------------------------------------------+
```

### 2.2 Capa de Datos Abiertos

| Fuente         | Tipo de Dato            | Formato             | Protocolo        |
| -------------- | ----------------------- | -------------------- | ---------------- |
| NASA FIRMS     | Anomalías térmicas      | CSV / GeoJSON        | REST API (HTTPS) |
| USGS           | Actividad sísmica       | GeoJSON              | REST API (HTTPS) |
| Open-Meteo     | Vectores de viento (U,V)| JSON / Binary GRIB2  | REST API (HTTPS) |
| GEBCO          | Batimetría / Elevación  | GeoTIFF / Heightmap  | Descarga estática|
| Safecast       | Radiación ambiental     | JSON / REST          | REST API (HTTPS) |
| EURDEP / RadNet| Dosis radiológica gamma | GeoJSON / WFS / XML  | REST API (HTTPS) |

Esta capa es el punto de entrada de todos los datos al sistema. Las consultas se realizan mediante `fetch()` con reintentos y caché local como mecanismo de fallback.

### 2.3 Capa de Computación (Web Workers)

Todo el procesamiento pesado se delega a **hilos secundarios (Web Workers)** para no bloquear el hilo principal de renderizado:

| Worker    | Responsabilidad                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------- |
| Worker 1  | **Ingesta y Normalización:** Parseo de GeoJSON/CSV masivos, conversión de coordenadas y Spatial Hashing.|
| Worker 2  | **Particionado Espacial:** Construcción de un Octree 3D para detección de proximidad y alertas.       |
| Worker 3  | **Decodificación de Viento:** Decodificación de rejillas GRIB2/ArrayBuffers de vectores $(U, V)$.     |

La comunicación entre workers y el hilo principal utiliza **Transferable Objects** y, donde el navegador lo permita, **SharedArrayBuffer** para transferencia de datos sin copia (zero-copy).

### 2.4 Capa de Renderizado GPU (Three.js)

Esta capa gestiona toda la representación visual en WebGL 2.0:

- **Fire Module:** Renderizado instanciado (`InstancedMesh`) de miles de focos de incendio con gradientes de color basados en FRP.
- **Wind Module:** Sistema de partículas GPU con actualización de posiciones vía shaders GLSL o Transform Feedback.
- **Seismic Module:** Geometrías cilíndricas extruidas con shaders de onda para animación de choque.
- **Ocean Module:** Malla de agua con displacement de heightmap y shader translúcido/refractor.
- **Radiation Module:** `InstancedMesh` o heatmap shader para lecturas radiológicas con shader de alerta cromática y parpadeo para umbrales críticos.

### 2.5 Capa de Interfaz Táctica (HUD)

Interfaz construida con **React** sobre el DOM, superpuesta al canvas WebGL:

- Dashboard de telemetría ambiental.
- Controles de capas (toggle por subsistema).
- Time-Scrubber para filtrado temporal.
- Feed de alertas en tiempo real.

---

## 3. Requisitos Funcionales (RF)

### Subsistema 1: Módulo del Globo Terrestre y Elevación Topográfica

#### RF-01 — Esfera Esférica y Shader Atmosférico

El sistema debe renderizar un **globo terráqueo 3D interactivo** utilizando WebGL/Three.js, con un shader personalizado en GLSL que simule:

- **Dispersión atmosférica** (Efecto Fresnel / Rayleigh).
- **Ciclo día/noche** con iluminación dinámica.

#### RF-02 — Mapeo de Elevación (Heightmap Displacement)

La malla del planeta debe aplicar un **mapa de elevación/batimetría** (Bump/Displacement Map) para extruir en 3D:

- Cadenas montañosas.
- Fosas oceánicas.
- Relieve continental.

---

### Subsistema 2: Ingesta y Visualización de Incendios (NASA FIRMS)

#### RF-03 — Renderizado Instanciado de Anomalías Térmicas

El sistema debe consumir la **API de NASA FIRMS** (instrumentos VIIRS y MODIS) y dibujar miles de focos de incendio sobre el planeta utilizando `InstancedMesh`.

#### RF-04 — Escala de Intensidad por Radiación (FRP)

Cada instancia de fuego debe mapear su tamaño y color según la **Potencia Radiativa del Fuego** ($MW/km^2$) proporcionada en la telemetría:

| FRP              | Color                | Tamaño  |
| ---------------- | -------------------- | ------- |
| Baja             | Amarillo tenue       | Pequeño |
| Media            | Naranja              | Medio   |
| Alta             | Rojo incandescente   | Grande  |
| Extrema          | Blanco               | Máximo  |

---

### Subsistema 3: Simulación de Corrientes de Viento en GPU

#### RF-05 — Campo de Partículas de Viento

El sistema debe procesar rejillas de vectores de viento $(U, V)$ procedentes de **Open-Meteo** o **NOAA** y renderizar un sistema de partículas continuo en la atmósfera del globo.

#### RF-06 — Cálculo de Trayectorias en GPU

Las partículas deben actualizar su posición $(x, y, z)$ directamente en la GPU mediante **shaders GLSL** o **Transform Feedback**, mostrando la dirección y velocidad del flujo de aire sobre la superficie.

---

### Subsistema 4: Monitor de Actividad Sísmica y Placas Tectónicas (USGS)

#### RF-07 — Columnas de Magnitud Hipocentral

El sistema debe consumir el **feed GeoJSON de la USGS** y representar cada terremoto como un cilindro/prisma extruido desde la corteza:

- **Altura del cilindro →** Profundidad del hipocentro.
- **Radio del cilindro →** Magnitud en la escala de Richter.

#### RF-08 — Animación de Ondas de Choque

Al registrarse un sismo reciente, el sistema debe disparar un **shader de anillo concéntrico** que se expanda radialmente sobre la superficie terrestre simulando la propagación de ondas P y S.

---

### Subsistema 5: Simulación de Inundación y Nivel del Mar

#### RF-09 — Shader Dinámico de Elevación de Agua

El sistema debe incorporar una **capa de agua transparente** con refracción. Un control deslizante en la interfaz permite incrementar el nivel del mar en metros: $+0m$ a $+10m$.

#### RF-10 — Inundación Costera

Al elevar el nivel del mar, el shader debe **enmascarar** (clipping/displacement) las áreas terrestres cuya elevación esté por debajo del umbral seleccionado, pintándolas como **sumergidas**.

---

### Subsistema 6: HUD Analítico y Filtros

#### RF-11 — Panel de Telemetría Ambiental

Al hacer clic en un incendio, sismo o partícula de viento, el sistema debe mostrar un **panel flotante** con los datos crudos:

- Coordenadas (latitud, longitud).
- Magnitud (sismos).
- Temperatura de brillo (incendios).
- Velocidad en nudos (viento).
- Profundidad (sismos).

#### RF-12 — Filtros de Capas y Rango Temporal

El usuario debe poder:

- **Conmutar de forma independiente** la visibilidad de capas: Fuego, Viento, Sismos, Inundación, Radiación.
- **Filtrar datos por rango de tiempo:** Últimas 24h, 7 días, 30 días.

---

### Subsistema 7: Monitor de Radiación Ambiental y Seguridad Nuclear

#### RF-13 — Ingesta y Normalización Radiológica

El sistema debe consumir feeds OSINT y oficiales de monitoreo radiológico en tiempo real (**Safecast API**, **EPA RadNet**, **EURDEP / JRC REMON**, **GMCMap**). El backend proxy y Worker 1 deben normalizar las distintas unidades de medida (tales como Cuentas Por Minuto — $\text{CPM}$) a un estándar único en microsieverts por hora ($\mu\text{Sv/h}$).

#### RF-14 — Visualización GLSL y Mapeo de Niveles de Alerta

El sistema debe renderizar los puntos de lectura o capas de calor radiológico sobre la corteza 3D del globo utilizando `InstancedMesh` o shaders de mapa de calor. La GPU asignará colores e indicadores dinámicos según los umbrales de seguridad:

| Tasa de Dosis ($\mu\text{Sv/h}$) | Categoría / Estado                      | Color GLSL / Efecto                    |
| -------------------------------- | --------------------------------------- | -------------------------------------- |
| $< 0.20$                         | Radiación de fondo natural (seguro)     | Azul / Verde tenue                     |
| $0.20 - 1.00$                    | Niveles elevados / anómalos             | Amarillo / Naranja                     |
| $> 1.00$                         | Umbral de alerta / Evento radiológico   | Rojo incandescente con parpadeo GLSL   |

---

## 4. Requisitos No Funcionales (RNF)

### 4.1 Rendimiento y Optimización de Gráficos

#### RNF-01 — Tasa de Refresco Fluida

| Métrica                  | Objetivo          |
| ------------------------ | ----------------- |
| FPS objetivo             | **60 FPS estables** |
| Datos simultáneos máximos| **> 20,000** datos combinados (partículas de viento, focos de fuego y sismos) |

#### RNF-02 — Presupuesto Estricto de Draw Calls

- Todas las geometrías repetitivas (focos de incendio y columnas sísmicas) deben empaquetarse en `InstancedMesh`.
- El total de **draw calls enviadas a la GPU no debe superar 8 por fotograma**.

---

### 4.2 Concurrencia y Manejo de Memoria

#### RNF-03 — Desplazamiento de Cómputo a Web Workers

Las siguientes operaciones **deben ejecutarse en hilos secundarios** (Web Workers), nunca en el hilo principal:

- Parseo de archivos GeoJSON/CSV masivos.
- Interpolación de vectores de viento.
- Cálculo de particionado espacial (Octree / Spatial Hashing).

#### RNF-04 — Cero Fugas de Memoria en la GPU

Al alternar filtros o actualizar conjuntos de datos en tiempo real, las geometrías, materiales y texturas antiguas deben ser **liberadas explícitamente**:

```javascript
geometry.dispose();
material.dispose();
texture.dispose();
```

Esto previene la saturación del VRAM de la tarjeta gráfica.

---

### 4.3 Red, Resiliencia y Compatibilidad

#### RNF-05 — Modo Fallback / Resiliencia de Datos

Si las APIs públicas (NASA, USGS, Open-Meteo) no responden o agotan sus cuotas, el sistema debe:

1. Detectar el fallo de forma transparente.
2. **Cambiar automáticamente a conjuntos de datos GeoJSON locales en caché.**
3. No romper la experiencia de usuario.

#### RNF-06 — Tiempo de Carga Inicial (FCP)

| Métrica                     | Objetivo              |
| --------------------------- | --------------------- |
| First Contentful Paint (FCP)| **< 2.0 segundos**    |
| Globo interactivo funcional | **< 3.5 segundos**    |

> Medido en conexiones estándar de red.

#### RNF-07 — Soporte de Navegadores

La aplicación debe ser **100% compatible** con navegadores modernos que soporten **WebGL 2.0** y **Web Workers**:

| Navegador | Soporte Requerido |
| --------- | ----------------- |
| Chrome    | ✅                |
| Firefox   | ✅                |
| Safari    | ✅                |
| Edge      | ✅                |

---

## 5. Matriz de Trazabilidad: Subsistemas ↔ Capas

| Subsistema              | Datos Abiertos | Workers | Renderizado GPU | HUD |
| ----------------------- | :------------: | :-----: | :-------------: | :-: |
| 1. Globo y Elevación    |    GEBCO       |    —    |    ✅           |  —  |
| 2. Incendios (FIRMS)    |    NASA        |   W1    |    ✅           |  ✅ |
| 3. Viento               |    Open-Meteo  |   W3    |    ✅           |  ✅ |
| 4. Sismos (USGS)        |    USGS        |   W1,W2 |    ✅           |  ✅ |
| 5. Inundación           |    GEBCO       |    —    |    ✅           |  ✅ |
| 6. HUD y Filtros        |      —         |    —    |      —          |  ✅ |
| 7. Radiación Ambiental  | Safecast / EURDEP / RadNet / GMCMap | W1 | ✅ | ✅ |

---

## 6. Glosario Técnico

| Término                | Definición                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **InstancedMesh**      | Técnica de Three.js para renderizar miles de copias de una misma geometría en una sola draw call.   |
| **FRP**                | Fire Radiative Power — Potencia radiativa del fuego medida en $MW/km^2$.                           |
| **Transform Feedback** | Mecanismo de WebGL 2.0 que permite capturar la salida de un vertex shader en un buffer de la GPU.   |
| **Octree**             | Estructura de datos de particionado espacial 3D que divide el espacio en 8 octantes recursivos.     |
| **Spatial Hashing**    | Técnica de indexado espacial que mapea coordenadas 3D a celdas de una tabla hash para consultas rápidas. |
| **Heightmap**          | Textura en escala de grises donde cada píxel codifica la elevación del terreno en ese punto.         |
| **GRIB2**              | Formato binario estándar de la OMM para datos meteorológicos y atmosféricos.                        |
| **Transferable Objects**| Objetos JavaScript (ArrayBuffer, ImageBitmap, etc.) cuya propiedad se transfiere al worker sin copia.|
| **FCP**                | First Contentful Paint — Momento en que el navegador renderiza el primer contenido visible.          |
| **Draw Call**          | Instrucción enviada a la GPU para dibujar un conjunto de geometrías. Minimizarlas mejora el rendimiento.|
| **$\mu\text{Sv/h}$**  | Microsieverts por hora — Unidad estándar de tasa de dosis de radiación ambiental.                       |
| **CPM**                | Cuentas Por Minuto — Unidad de lectura bruta de un contador Geiger. Se convierte a $\mu\text{Sv/h}$ mediante factores de calibración. |
| **Heatmap Shader**     | Shader GLSL que renderiza una capa de mapa de calor sobre la superficie del globo basada en densidad o intensidad de datos puntuales. |

---

*Este documento sirve como especificación base para el desarrollo del proyecto GAIA.*
