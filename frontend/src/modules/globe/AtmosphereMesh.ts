/**
 * Shader de atmósfera (ROADMAP 1.2.2, ajustado por el usuario antes de validar 1.4.1).
 *
 * Sustituye al `MeshStandardMaterial` de 1.2.1. Decisión de 1.2.2: un único material
 * que hace las tres cosas del criterio (lado noche oscuro, terminador y brillo de borde)
 * en un draw call, en vez de una cáscara exterior aparte. El coste es que el sol se
 * calcula aquí con un uniform en vez de venir de una `DirectionalLight`. **El usuario
 * pidió quitar el día/noche** (que el planeta se vea siempre claro): el shader ya no
 * tiene `solDireccion` ni lado noche; se conserva el brillo del limbo.
 *
 * Qué manda y de dónde sale cada cosa:
 *
 * - La iluminación es **uniforme** (pedido del usuario antes de validar 1.4.1): no hay
 *   lado noche ni terminador — el planeta se ve siempre claro, cualquier parte. El
 *   `solDireccion` de 1.2.2 desaparece del shader.
 * - El resplandor del **limbo** se mantiene: es "muy sutil, difuso hacia el espacio,
 *   opacidad baja, no un halo de neón" (`GAIA_VISUAL_DESIGN.md` §4), con el acento
 *   `--gaia-accent` `#3FD8C9` (§5.1). Por eso `intensidadBorde` arranca en 0.35: un
 *   susurro en el borde del disco, no un resplandor.
 * - La luz va **fija en el espacio** y la cámara orbita (la dirección de F1 es "globo
 *   girando + cámara orbital"): como ya no hay día/noche, el brillo del limbo es
 *   simétrico alrededor del disco y no depende de ninguna dirección.
 *
 * El desplazamiento por altura de 1.3.1 entra por los uniforms `nivelBajo`,
 * `nivelAlto`, `pesoNivelAlto` y `escalaElevacion`: el vertex shader lee los dos
 * heightmaps, decodifica la elevación en metros (fórmula Terrarium de
 * `GAIA_GLOBE_TEXTURES` §2.1) y desplaza el vértice a lo largo de su normal. Lo apaga
 * `escalaElevacion = 0`, que es el default: sin `cargarElevacion()` el globo es la
 * esfera lisa de 1.2.1. La normalización de 1.3.2 entra por `nivelMar`: la elevación
 * se recorta a ese mínimo (0 = nivel del mar) antes de escalar, así los océanos son
 * planos en la superficie terrestre y la batimetría no hace hoyos; el valor lo fija
 * la constante `NIVEL_MAR` de `ElevationLOD`, y `desplazamiento()` es el espejo CPU.
 * La textura satelital de 1.4.1 entra por los uniforms `u_atlasA`/`u_atlasB`
 * (`sampler2D` de dos niveles), `u_cruce` (peso del fade entre ellos, tabla de
 * `nivelesConFade`) y `u_tieneAtlas` (0 = no hay textura, se pinta `colorTierra`).
 * El fragment convierte la `uv` equirectangular a mercator con la MISMA fórmula que
 * `tilesSatelite.ts` (patrón `decodeTerrarium`/GLSL: el atlas se compone en esa
 * proyección, así que muestrear en la propia coordenada mercator evita costuras).
 */
import { Color, Mesh, ShaderMaterial, SphereGeometry } from "three";

/** Radio del geoide. Compartido con `TerrainMesh`: es el contrato de 1.2.1. */
const RADIO = 1;
const SEGMENTOS_ANCHO = 128;
const SEGMENTOS_ALTO = 64;

/** Color de la tierra sin textura, el de 1.2.1 (`COLOR_TIERRA` de `TerrainMesh.ts`). */
const COLOR_TIERRA = new Color(0x1b3a52);

/** `--gaia-accent` de `GAIA_VISUAL_DESIGN.md` §5.1. */
const COLOR_ACENTO = new Color(0x3fd8c9);

/*
 * Los dos shaders no llevan comentarios dentro a propósito: el contenido de un template
 * literal no lo toca el minificador, así que cada línea de comentario GLSL se cuenta como
 * peso en el chunk de arranque. La prueba fue el gate de baseline, que saltó +1,9 % con
 * ellos dentro (+0,5 % sin ellos). La explicación va aquí, que esto sí se elimina.
 *
 * `vertexShader`: decodifica la elevación de los dos levels desde el atributo `uv`
 * (la geometría es una esfera equirectangular) y desplaza el vértice a lo largo de su
 * normal: en una esfera desplazada radialmente la normal no cambia, así que la
 * analítica sigue valiendo. El `smoothstep` de los niveles lo elige `ElevationLOD` por
 * distancia de cámara, y el cruce continuo es lo que evita las caídas bruscas de LOD.
 *
 * `fragmentShader`, en orden:
 *   1. `superficie` es la textura de 1.4.1 (o el color base): **sin día/noche**, el
 *      pedido del usuario es que el planeta se vea siempre claro.
 *   2. `borde` = pow(1 - dot(vista, n), exponenteBorde). Da 1 en el limbo —donde la
 *      normal es perpendicular a la vista— y cae a 0 de cara. El resplandor del acento
 *      vive en el borde del disco, uniforme alrededor (no hay terminador que acentuar).
 */
const vertexShader = /* glsl */ `
uniform sampler2D nivelBajo;
uniform sampler2D nivelAlto;
uniform float pesoNivelAlto;
uniform float escalaElevacion;
uniform float nivelMar;
varying vec3 vNormalMundo;
varying vec3 vPosicionMundo;
varying vec2 vUv;
void main() {
  vec2 cuadr = vec2(uv.x, 1.0 - uv.y);
  float bajo = (texture2D(nivelBajo, cuadr).r * 256.0 + texture2D(nivelBajo, cuadr).g + texture2D(nivelBajo, cuadr).b / 256.0) - 32768.0;
  float alto = (texture2D(nivelAlto, cuadr).r * 256.0 + texture2D(nivelAlto, cuadr).g + texture2D(nivelAlto, cuadr).b / 256.0) - 32768.0;
  float elevacion = max(mix(bajo, alto, pesoNivelAlto), nivelMar);
  vec3 pos = position * (1.0 + elevacion * escalaElevacion);
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  vPosicionMundo = (modelMatrix * vec4(pos, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 colorTierra;
uniform vec3 colorAcento;
uniform float intensidadBorde;
uniform float exponenteBorde;
uniform sampler2D u_atlasA;
uniform sampler2D u_atlasB;
uniform float u_cruce;
uniform float u_tieneAtlas;
varying vec3 vNormalMundo;
varying vec3 vPosicionMundo;
varying vec2 vUv;
void main() {
  vec3 superficie = colorTierra;
  if (u_tieneAtlas > 0.5) {
    vec2 merc = vec2(fract(vUv.x + 0.25), 0.5 - log(tan(3.141592653589793 / 4.0 + radians(vUv.y * 180.0 - 90.0) / 2.0)) / (2.0 * 3.141592653589793));
    merc = clamp(merc, 0.0, 0.99999);
    vec3 a = texture2D(u_atlasA, merc).rgb;
    vec3 b = texture2D(u_atlasB, merc).rgb;
    superficie = mix(a, b, u_cruce);
  }
  vec3 n = normalize(vNormalMundo);
  vec3 color = superficie;
  vec3 vista = normalize(cameraPosition - vPosicionMundo);
  float borde = pow(1.0 - max(dot(vista, n), 0.0), exponenteBorde);
  color += colorAcento * borde * intensidadBorde;
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Parámetros de la atmósfera, que el criterio de 1.2.2 exige ajustables.
 *
 * Los tres defaults salen de `GAIA_VISUAL_DESIGN.md` §4 y §5.1; los valores concretos
 * son calibración, no están fijados por ningún doc.
 */
export interface AtmosphereOptions {
  /** Color del resplandor. `--gaia-accent` por defecto. */
  color?: number;
  /** Cuánto resplandece el borde. 0.35 = "muy sutil", no halo de neón. */
  intensidad?: number;
  /** Exponente del falloff del borde: alto lo concentra, bajo lo reparte. */
  exponente?: number;
}

export class AtmosphereMesh {
  readonly malla: Mesh;
  readonly material: ShaderMaterial;

  constructor(opciones: AtmosphereOptions = {}) {
    this.material = new ShaderMaterial({
      uniforms: {
        colorTierra: { value: COLOR_TIERRA.clone() },
        colorAcento: {
          value: new Color(opciones.color ?? COLOR_ACENTO.getHex()),
        },
        intensidadBorde: { value: opciones.intensidad ?? 0.35 },
        exponenteBorde: { value: opciones.exponente ?? 3.0 },
        // Textura satelital de 1.4.1: apagada por defecto; la encienden
        // `u_tieneAtlas` (0 = color base) y los atlas que vincula `TileManager`.
        u_atlasA: { value: null },
        u_atlasB: { value: null },
        u_cruce: { value: 0 },
        u_tieneAtlas: { value: 0 },
        // Elevación de 1.3.1: apagada por defecto (escala 0), la enciende
        // `GlobeModule.cargarElevacion()`. `nivelMar` (1.3.2) es el mínimo de la
        // elevación: aplanar océanos; el valor lo pone la constante `NIVEL_MAR`.
        nivelBajo: { value: null },
        nivelAlto: { value: null },
        pesoNivelAlto: { value: 0 },
        escalaElevacion: { value: 0 },
        nivelMar: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });

    this.malla = new Mesh(
      new SphereGeometry(RADIO, SEGMENTOS_ANCHO, SEGMENTOS_ALTO),
      this.material,
    );
    this.malla.name = "geoide";
  }

  /** Los tres parámetros del criterio, sin reconstruir el material. */
  set parametros(p: AtmosphereOptions) {
    const u = this.material.uniforms;
    if (p.color !== undefined) u.colorAcento.value.setHex(p.color);
    if (p.intensidad !== undefined) u.intensidadBorde.value = p.intensidad;
    if (p.exponente !== undefined) u.exponenteBorde.value = p.exponente;
  }

  dispose(): void {
    this.malla.geometry.dispose();
    this.material.dispose();
  }
}
