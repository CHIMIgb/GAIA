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
 * La textura satelital de 1.4.1 entra por los uniforms `u_atlasA`/`u_atlasB`
 * (`sampler2D` de dos niveles), `u_cruce` (peso del fade entre ellos, tabla de
 * `nivelesConFade`) y `u_tieneAtlas` (0 = no hay textura, se pinta `colorTierra`).
 * `u_rectA` (u0, v0, ancho, alto) es el rectángulo mercator que cubre A: el mundo entero
 * para los atlas globales z0-z4, y solo la región visible para el atlas de vista de z6.
 * El fragment convierte la `uv` equirectangular a mercator con la MISMA fórmula que
 * `tilesSatelite.ts` (el atlas se compone en esa proyección, así que muestrear en la
 * propia coordenada mercator evita costuras).
 */
import { Color, Mesh, ShaderMaterial, SphereGeometry, Vector4 } from "three";

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
 * `vertexShader`: solo lleva las posiciones y las varyings; la geometría es la esfera
 * lisa de 1.2.1, sin displacement.
 *
 * `fragmentShader`, en orden:
 *   1. `superficie` es la textura de 1.4.1 (o el color base): **sin día/noche**, el
 *      pedido del usuario es que el planeta se vea siempre claro.
 *   2. `borde` = pow(1 - dot(vista, n), exponenteBorde). Da 1 en el limbo —donde la
 *      normal es perpendicular a la vista— y cae a 0 de cara. El resplandor del acento
 *      vive en el borde del disco, uniforme alrededor (no hay terminador que acentuar).
 */
const vertexShader = /* glsl */ `
varying vec3 vNormalMundo;
varying vec3 vPosicionMundo;
varying vec2 vUv;
void main() {
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  vPosicionMundo = (modelMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 colorTierra;
uniform vec3 colorAcento;
uniform float intensidadBorde;
uniform float exponenteBorde;
uniform sampler2D u_atlasA;
uniform sampler2D u_atlasB;
uniform vec4 u_rectA;
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
    vec3 b = texture2D(u_atlasB, merc).rgb;
    // El atlas A puede ser un atlas de vista (z6), que solo cubre el rectángulo
    // mercator u_rectA (u0, v0, ancho, alto): dentro se muestra con su uv local y
    // fuera se cae al atlas global B, que sí cubre el mundo entero. Con un atlas
    // global, u_rectA es (0,0,1,1) y esto es el muestreo directo de antes.
    vec2 local = (merc - u_rectA.xy) / u_rectA.zw;
    if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
      superficie = mix(texture2D(u_atlasA, local).rgb, b, u_cruce);
    } else {
      superficie = b;
    }
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
        // Rectángulo mercator (u0, v0, ancho, alto) que cubre el atlas A. Por defecto el
        // mundo entero, que es el caso de los atlas globales z0-z4; `TileManager` lo
        // estrecha al rectángulo de vista cuando A es el atlas de vista de z6.
        u_rectA: { value: new Vector4(0, 0, 1, 1) },
        u_cruce: { value: 0 },
        u_tieneAtlas: { value: 0 },
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
