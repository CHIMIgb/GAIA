# GAIA — Identidad Visual y Diseño de Interfaz

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.2  
> **Fecha:** 2026-09-22  
> **Alcance:** Define la identidad visual de GAIA: marca, estética del planeta, paleta, tipografía, iconografía, layout, movimiento y accesibilidad. Es la fuente de verdad para toda decisión de interfaz. Refina el "HUD táctico" descrito en [TECH_STACK 2.8](./GAIA_TECH_STACK.md).

---

## Contenido

1. [Principio rector](#1-principio-rector)
2. [La marca GAIA](#2-la-marca-gaia)
3. [Concepto visual: Órbita y Telemetría](#3-concepto-visual-órbita-y-telemetría)
4. [Estética del planeta](#4-estética-del-planeta)
5. [Paleta cromática](#5-paleta-cromática)
6. [Tipografía](#6-tipografía)
7. [Iconografía](#7-iconografía)
8. [Formas, radios y espaciado](#8-formas-radios-y-espaciado)
9. [Layout: el planeta como pieza central](#9-layout-el-planeta-como-pieza-central)
10. [Movimiento](#10-movimiento)
11. [Voz de la interfaz y estados](#11-voz-de-la-interfaz-y-estados)
12. [Accesibilidad](#12-accesibilidad)
13. [Anti-patrones](#13-anti-patrones)
14. [Aplicación al HUD](#14-aplicación-al-hud)
15. [Tokens de diseño e implementación](#15-tokens-de-diseño-e-implementación)

---

## 1. Principio rector

**El planeta es el producto.**

GAIA es una ventana a la Tierra en tiempo real. Todo lo demás — paneles, botones, leyendas — existe únicamente para enmarcar y explicar el globo, nunca para competir con él. La interfaz debe percibirse como un instrumento de precisión: silenciosa, contenida y legible de un vistazo. Si un elemento no ayuda a leer el planeta, no debería estar en pantalla.

Tres reglas que no se negocian:

1. **Menos es más.** El estado por defecto muestra el planeta en pantalla completa y un mínimo de controles (ver [pantalla basal](#9-layout-el-planeta-como-pieza-central)). Nada se muestra "por si acaso".
2. **Una sola capa protagonista.** En cada momento un único subsistema (incendios, viento, sismos, inundación, radiación) es el foco; el resto permanece oculto o visible solo a petición del usuario.
3. **Cero fricción cognitiva.** Sin texturas agresivas, sin gradientes brillantes, sin animaciones decorativas, sin sobrecarga de números y sin emojis (solo [iconos de línea](#7-iconografía)).

---

## 2. La marca GAIA

### 2.1 Isotipo

El símbolo de GAIA es un **orbe de línea continua**: un círculo de trazo único que representa el planeta visto desde la órbita, cruzado por un **meridiano** (elipse vertical sutil) y una **línea de ecuador** (elipse horizontal). Una sola línea, sin relleno, en `--gaia-accent`.

| Atributo | Valor |
| -------- | ----- |
| Forma | Orbe + meridiano + ecuador, un solo camino vectorial |
| Trazo | 1.5 px (consistente con la [iconografía](#7-iconografía)) |
| Tono | `--gaia-accent` (sobre fondo oscuro) o `--gaia-text` (en variantes monocromáticas) |
| Proporción | Siempre dentro de un cuadrado 1:1; el orbe ocupa ~80% del encuadre |
| Uso | Favicon (`public/favicon.ico`), pantalla de carga inicial, wordmark del HUD |

### 2.2 Wordmark

El logotipo de texto es **"GAIA"**:

- Familia **Space Grotesk**, peso 500, siempre **en mayúsculas**.
- `letter-spacing: 0.08em` (espaciado amplio, carácter técnico-orbital).
- Color `--gaia-text`; opcional acompañar del lotipo (isotipo + wordmark en línea).
- Nunca se deforma (sin stretching), nunca en minúsculas, nunca con degradados ni emojis.

### 2.3 Reglas de uso de la marca

- Área de respiro: margen igual a la altura de la "G" en al menos dos lados.
- Sobre el planeta (HUD), la marca se muestra con una alfa de 85%, en posición fija superior izquierda.
- Solo puede aparecer en modo claro (el tema completo de GAIA) sobre `--gaia-bg` o `--gaia-surface`.

---

## 3. Concepto visual: Órbita y Telemetría

La identidad se construye sobre dos pilares opuestos pero complementarios:

| Pilar | Carácter | Cómo se expresa |
| ----- | -------- | --------------- |
| **Órbita** | El planeta, la profundidad, el silencio del espacio | Fondo negro azulado, planeta fotorrealista neutralizado, jerarquía por luz |
| **Telemetría** | El dato, la precisión, la seriedad técnica | Tipografía mono para cifras, bordes finos, iconos de línea, un solo acento |

El resultado es una estética de cabina de monitoreo orbital: sobria, técnica, sin ruido decorativo y sin referencias genéricas de dashboards comerciales.

---

## 4. Estética del planeta

La pieza central de GAIA. El globo se ve **desde la órbita**: fotográfico pero contenido, jamás estridente.

| Aspecto | Decisión |
| ------- | -------- |
| Textura de superficie | Esri World Imagery (fotografía real), con **desaturación leve (~ −15%)** y contraste suave; nunca brillante ni saturada (fuente: `GAIA_GLOBE_TEXTURES.md`) |
| Océano (fallback y submalla) | Azul-gris profundo `#0B1420`, más frío que cualquier superficie UI; evita competir con `--gaia-surface` |
| Atmósfera | Resplandor del acento `--gaia-accent` muy sutil en el **terminador** (día/noche), difuso hacia el espacio; opacidad baja (no un halo de neón) |
| Fondo espacial | `--gaia-bg` con estrellas mínimas (puntos ≤ 1 px, alfa ≤ 40%); sin nebulosas, sin vía láctea llamativa, sin ruido |
| Noche urbana | No se pinta por defecto; si se añade, atenuada y sin puntos brillantes |

**Regla "el planeta siempre gana":** ninguna capa de datos puede superar la luminancia de la textura en más de ~1.2×. Las capas se dibujan sobre el globo como marcas de precisión, no como videowall.

---

## 5. Paleta cromática

Tema **oscuro permanente** (no existe modo claro). Los fondos descienden hacia el espacio; las superficies se elevan solo con luminancia, no con sombras dramáticas.

### 5.1 Paleta base (UI)

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--gaia-bg` | `#05070B` | Fondo del espacio, detrás del lienzo WebGL |
| `--gaia-surface` | `#0B1016` | Paneles del HUD, barras |
| `--gaia-surface-2` | `#111A22` | Elementos elevados: badges, tooltips |
| `--gaia-border` | `rgba(148, 163, 184, 0.16)` | Bordes de 1px de paneles y separadores |
| `--gaia-text` | `#E6EDF3` | Texto primario |
| `--gaia-text-dim` | `#8B98A9` | Texto secundario, etiquetas, hints |
| `--gaia-accent` | `#3FD8C9` | **Único acento** ("aura terrestre"): foco, elemento activo, acciones primarias |

El acento se usa con mesura: **un solo acento por pantalla**, y solo para lo que está vivo, activo o requiere atención. Nunca en bloques grandes de color.

### 5.2 Colores de capas (solo sobre el planeta)

Estos tonos pertenecen a las capas de datos renderizadas por GPU, no a la UI. Cada subsistema tiene un solo tono, con variación de luminancia por severidad:

| Módulo | Tono base | Forma del símbolo |
| ------ | --------- | ----------------- |
| Incendios (NASA FIRMS) | Ámbar `#FF9F43` | Punto con halo, mayor luminancia según FRP |
| Sismos (USGS) | Azul claro `#7FB4FF` | Cilindro extruido + anillo de onda |
| Viento | Verde `#70D6A4` | Partícula/gota direccional |
| Inundación | Azul océano `#50B5F2` | Capa de agua/línea de costa |
| Radiación | Violeta `#B48BFF` | Punto + anillo de umbral |

**Doble codificación obligatoria.** Como sismo e inundación comparten familia azul, y viento se acerca al acento, la distinción nunca depende solo del color. Todo dato lleva **tono + forma + luminancia por severidad + etiqueta**: la leyenda de una capa activa muestra símbolo (no solo mancha de color), y el tooltip identifica el módulo por texto. Además, la regla de **una sola capa protagonista** (sección 1) impide que capas de familias cromáticas cercanas compitan en pantalla.

### 5.3 Estados

| Token | Color | Uso |
| ----- | ----- | --- |
| `--gaia-ok` | `#4ADE80` | Dot de estado del sistema |
| `--gaia-warning` | `#FACC15` | Caché/fallback activo, retención |
| `--gaia-error` | `#F87171` | Fuente caída, sin conexión |

Colores de estado solo en dots y badges pequeños; nunca en botones de acción ni en bloques.

---

## 6. Tipografía

Tres familias máximo, todas **autoalojadas en WOFF2** (sin CDN externo; alinear con el presupuesto de bundle ≤ 450 KB gzip del ROADMAP §17).

| Familia | Rol | Pesos |
| ------- | --- | ----- |
| **Space Grotesk** | Display: wordmark, títulos de panel, números grandes del HUD | 400, 500 |
| **Inter** | UI: botones, etiquetas, cuerpo de paneles | 400, 500, 600 |
| **IBM Plex Mono** | Telemetría: FPS, lat/lon, hora UTC, valores de módulos | 400, 500 |

Reglas:

- Escala base: `12 / 13 / 15 / 18 / 24 px`. Nunca por debajo de 12 px en interfaz.
- Todos los valores de datos, coordenadas y reloj en mono con **numerales tabulares**.
- Wordmark "GAIA" en Space Grotesk, mayúsculas, `letter-spacing: 0.08em`.
- Subsetting en build (latin + dígitos + signos comunes), `font-display: swap`; solo se cargan los pesos en uso.
- Tono neutro en toda la interfaz ("foco activo", nunca "¡Detectado!").

---

## 7. Iconografía

- **Sin emojis jamás.** Solo iconos vectoriales de línea.
- Trazo continuo de **1.5 px**, uniones y remates redondeados (`round` joins/caps).
- Cuadrícula base **24 × 24 px**; el icono ocupa el área visual central con respiro mínimo.
- **Contorno únicamente** (sin rellenos ni gradientes). Estado activo: `--gaia-accent` y trazo a 2 px; la forma nunca cambia.
- Los iconos son asistencia, **no reemplazan al texto**: cada icono crítico va con etiqueta o tooltip.
- Implementación: set propio de SVGs inline (`frontend/src/components/icons/`); si se usa una librería (p. ej. Lucide), solo se copian trazos de 1.5 px adaptados al criterio, sin importar sets completos.

Conjunto mínimo definido: 5 iconos de capas (coinciden con la [sección 5.2](#52-colores-de-capas-solo-sobre-el-planeta)), tiempo/reloj, telemetría, leyenda, colapsar/expandir, cerrar, ajustes, estado (OK/warning/error), descarga/fallback.

---

## 8. Formas, radios y espaciado

| Token | Valor | Uso |
| ----- | ----- | --- |
| `--gaia-radius-lg` | `8px` | Paneles, barras |
| `--gaia-radius-md` | `6px` | Botones, chips, tooltips |
| `--gaia-radius-sm` | `4px` | Inputs, toggles pequeños |
| `--gaia-space` | `4px` | Grid base: 4 / 8 / 12 / 16 / 24 / 32 |

- Bordes de **1px translúcidos** (`--gaia-border`) sobre superficies con `backdrop-blur` sutil (efecto vidrio, opacidad de fondo ≥ 70%).
- Sin sombras profundas ni elevaciones decorativas: la jerarquía se comunica con luminancia de fondo y grosor de borde.
- Objetivo táctil mínimo **40 × 40 px** (44 px en táctil).

---

## 9. Layout: el planeta como pieza central

El lienzo WebGL ocupa **todo el viewport**; el HUD es un overlay absoluto (coincide con la estructura de `HUDLayout.tsx` en PROJECT_STRUCTURE).

### 9.1 Pantalla basal (estado de arranque)

Lo único visible al cargar GAIA, en orden:

1. El planeta (E2E renderizado) + fondo espacial.
2. Superior izquierda: isotipo + "GAIA" + dot de estado del sistema.
3. Superior centro: conmutador de módulo (pestañas finas, solo icono; la etiqueta aparece al hover/foco).
4. Superior derecha: hora UTC y lat/lon del cursor (mono).
5. Barra de tiempo (time-scrubber) colapsada al borde inferior.

Todo lo demás (panel de capas, leyendas, telemetría extendida) nace de una acción del usuario.

### 9.2 Zonas fijas

| Zona | Contenido |
| ---- | --------- |
| Superior izquierda | Isotipo + wordmark "GAIA" + dot de estado |
| Superior centro | Conmutador de módulo (pestañas finas) |
| Superior derecha | Hora UTC + lat/lon del cursor (mono) |
| Izquierda | Panel de capas **colapsable** (se despliega a demanda) |
| Inferior centro | Barra de tiempo fina (time-scrubber) + escala temporal |
| Click en objeto | Tooltip anclado al punto + panel de telemetría compacto (esquina inferior derecha) |

### 9.3 Reglas de saturación

- Máximo **8 controles visibles simultáneamente** en reposo (misma frugalidad que el presupuesto RNF-02 / ROADMAP §17 de ≤ 8 draw calls).
- Todo panel es colapsable; el estado persistido en Valtio (coincide con `GAIA_STATE.md`).
- El planeta siempre ocupa ≥ 70% del viewport; ningún panel fijo puede cubrirlo en reposo.

### 9.4 Responsivo

- El planeta siempre a pantalla completa, en cualquier tamaño.
- **< 768 px**: el HUD colapsa a *bottom-sheets* plegadas; se oculta la telemetría de cursor (lat/lon) y el wordmark se reduce al isotipo; hit targets pasan a 44 px.
- No se escala el HUD "abriendo" paneles laterales que tapen el globo; la interacción de capas pasa al fondo de pantalla.

---

## 10. Movimiento

El movimiento solo comunica cambio; nada decorativo.

| Tipo | Duración | Curva |
| ---- | -------- | ----- |
| Hover/active (micro) | 100–150 ms | `ease-out` |
| Paneles (abrir/cerrar) | 200 ms | `ease-out` |
| Tooltip | 120 ms | `ease-out` |

- El globo rota de forma fluida tras el drag con inercia suave; auto-rotación solo en idle > 30 s y a velocidad mínima.
- Fade y desplazamiento solo en los ejes implícitos (un panel entra desde el borde del que cuelga); sin scale-pop ni rebote.
- **`prefers-reduced-motion`**: se inhiber inercia, auto-rotación y transiciones de panel; solo quedan fades de ~80 ms. Nunca se animan datos que el usuario necesita leer.

---

## 11. Voz de la interfaz y estados

### 11.1 Voz de la interfaz (microcopy)

GAIA habla como un instrumento: corto, neutro, preciso.

- Frases breves (≤ 6 palabras cuando sea posible), sin adjetivos ni exclamaciones.
- Títulos en minúsculas; solo se capitalizan nombres propios y el wordmark.
- Se informa el hecho, no la emoción ("Fuente sin respuesta", no "¡Ups!").
- Valores siempre en mono: `60 FPS`, `p95 18 ms`, `coords –12.04°, –77.04°`.

### 11.2 Estados

| Estado | Representación |
| ------ | -------------- |
| Cargando | Anillo de línea fina (trazo único, `--gaia-accent`), sin spinners gigantes |
| Error | Chip discreto: icono de línea + texto corto ("Fuente sin respuesta") |
| Vacío | "Sin eventos recientes" en `--gaia-text-dim`, sobre la zona de datos |
| Fallback activo | Badge con `--gaia-warning` (coincide con RNF-05); desaparece al recuperar |

El feedback es inmediato (≤ 100 ms) y discreto: el hover solo eleva la luminancia del borde o la superficie; nunca cambia el color del bloque.

---

## 12. Accesibilidad

- **Contraste AA mínimo** (WCAG): texto ≥ 4.5:1, gráficos/iconos ≥ 3:1. Ratios reales de la paleta de GAIA (verificados): texto primario 16.2:1, texto secundario 6.5:1, acento 10.8:1 sobre `--gaia-surface`. Validar en cada cambio de token.
- **Foco visible**: outline de 1px en `--gaia-accent` + 2px de offset; se aplica a toda interacción por teclado.
- **Targets**: ≥ 40 × 40 px (44 px en táctil), espaciados según grid de 4px.
- **Teclado**: conmutador de módulos, capas y time-scrubber operables por teclado; navegación sin trampas de foco.
- **`prefers-reduced-motion`**: ver sección 10.
- **Daltonismo**: la doble codificación (tono + forma + texto) de la sección 5.2 mantiene la información sin depender del color.
- Zoom al 200% sin romper el layout del HUD (los paneles siguen colapsables).

---

## 13. Anti-patrones

GAIA nunca es esto:

- **Emojis** en ningún punto de la interfaz (solo símbolos de línea y texto).
- **Azul SaaS genérico** (p. ej. `#2563EB`) y "look startup" de botón hueco brillante.
- **Gradientes llamativos**, neones o efectos de "glow" en la UI (el único brillo permitido es el resplandor atmosférico del planeta).
- **Glassmorphism exagerado**: blur alto con opacidad baja o bordes blancos brillantes.
- **Sombras suaves grandes** (tarjetas flotantes) y elevaciones decorativas.
- **Modo claro**.
- **Radios de panel > 12 px** y botones "píldora" gigantes de marca.
- **Dashboards densos multicolores** con muchos paneles simultáneos.
- **Tooltips con relleno sólido** de color de data; los tooltips usan `--gaia-surface-2` + borde.
- Animaciones decorativas continuas (spinners grandes, marquees, scoreboards parpadeantes).

---

## 14. Aplicación al HUD

### 14.1 Zona → token

| Elemento | Fondo | Borde | Texto | Acento |
| -------- | ----- | ----- | ----- | ------ |
| Top bar | `--gaia-surface` | `--gaia-border` | `--gaia-text` | dot de estado |
| Pestaña de módulo activa | `--gaia-surface-2` | acento 1px | `--gaia-text` | icono en `--gaia-accent` |
| Panel de capas | `--gaia-surface` + blur | `--gaia-border` | `--gaia-text` / `--gaia-text-dim` | toggle activo |
| Bloque de telemetría | `--gaia-surface-2` | `--gaia-border` | valores en mono, `--gaia-text` | — |
| Chip de estado | `--gaia-surface-2` | semántico 1px | `--gaia-text-dim` | dot semántico |

### 14.2 Componentes base (especificación visual)

| Componente | Definición |
| ---------- | ---------- |
| **Button** | `--gaia-surface-2`, borde `--gaia-border`, radio `--gaia-radius-md`, hover eleva luminancia; primario: acento en borde, nunca bloque de color |
| **Toggle** | Switch de 16×9 px, track `--gaia-border`, thumb `--gaia-text`; activo: track/thumb acento |
| **Chip** | Etiqueta + dot/icono de línea, fondo `--gaia-surface`, radio `--gaia-radius-md` |
| **Slider** | Track fino 2px `--gaia-border`, thumb 12×12 px acento (time-scrubber y nivel del mar) |
| **Tooltip** | `--gaia-surface-2`, borde `--gaia-border`, radio `--gaia-radius-md`, texto mono para datos |
| **TimeScrubber** | Barra fina inferior: línea de tiempo, marcador del presente, thumb acento |

---

## 15. Tokens de diseño e implementación

- Los tokens viven en CSS `:root` como fuente única, mapeados a utilidades de Tailwind (`tailwind.config.js`: `extend.colors`, `fontFamily`, `borderRadius`).
- Los shaders GLSL reciben la paleta vía uniforms, para que las capas 3D y la UI nunca diverjan en color.
- Prohibido hardcodear colores fuera de los tokens (ni en componentes React ni en shaders).
- Los componentes base de la sección 14.2 son el kit reutilizable (coincide con los componentes compartidos del HUD en PROJECT_STRUCTURE y la Fase 7 del ROADMAP).

> Nota de coherencia: este documento refina el "HUD táctico" descrito en [TECH_STACK 2.8](./GAIA_TECH_STACK.md): el criterio mínimo y sobrio aquí definido prevalece sobre la idea de dashboards densos. Complementa [GAIA_GLOBE_TEXTURES](./GAIA_GLOBE_TEXTURES.md) (origen de la textura y elevación del planeta) y la [Fase 0](./GAIA_ROADMAP.md) para arrancar la UI. Ver [RECOMENDACIONES P0](./GAIA_RECOMENDACIONES.md).