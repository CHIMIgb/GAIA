/**
 * Shader de atmósfera día/noche (ROADMAP 1.2.2).
 *
 * Sustituye al `MeshStandardMaterial` de 1.2.1. Decisión de 1.2.2: un único material
 * que hace las tres cosas del criterio (lado noche oscuro, terminador y brillo de borde)
 * en un draw call, en vez de una cáscara exterior aparte. El coste es que el sol se
 * calcula aquí con un uniform en vez de venir de una `DirectionalLight`.
 *
 * Qué manda y de dónde sale cada cosa:
 *
 * - El resplandor va en el **terminador** y es "muy sutil, difuso hacia el espacio,
 *   opacidad baja, no un halo de neón" (`GAIA_VISUAL_DESIGN.md` §4), con el acento
 *   `--gaia-accent` `#3FD8C9` (§5.1). Por eso `intensidadBorde` arranca en 0.35 y no
 *   en 1.0: es un susurro, no un resplandor de(neón).
 * - El lado noche se ve **oscuro** (§4 "Noche urbana: no se pinta por defecto"), así que
 *   no hay luces de ciudad ni brillo extra en la cara nocturna: solo se apaga.
 * - La luz va **fija en el espacio** y la cámara orbita (la dirección de F1 es "globo
 *   girando + cámara orbital"): `solDireccion` no se toca por frame, y por eso al girar
 *   la cámara se ve pasar el terminador por el globo.
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
import { Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

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
 *   1. `luz` = smoothstep(-0.12, 0.28, dot(n, solDireccion)). El producto punto va de 1
 *      (cara al sol) a -1 (opuesta); el smoothstep elige el ancho del terminador. Con un
 *      rango estrecho (0..1) el crepúsculo se ensancha y la noche queda nítida, que es lo
 *      contrario de un terminador real.
 *   2. `color` = mix(base * ladoNoche, base, luz). El lado noche **se apaga**, no se le
 *      añade luz: `GAIA_VISUAL_DESIGN` §4 dice que la noche urbana no se pinta por
 *      defecto, así que aquí no hay nada que se parezca a luces de ciudad.
 *   3. `borde` = pow(1 - dot(vista, n), exponenteBorde). Da 1 en el limbo —donde la
 *      normal es perpendicular a la vista— y cae a 0 de cara. Multiplicado por `luz`, el
 *      resplandor del acento vive en la franja del terminador y no en toda la esfera.
 *      La textura satelital entra por `u_atlasA`/`u_atlasB`, crossfade con `u_cruce`;
 *      con `u_tieneAtlas = 0` el globo es el color base de 1.2.1.
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
uniform vec3 solDireccion;
uniform float intensidadBorde;
uniform float exponenteBorde;
uniform float ladoNoche;
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
  float luz = smoothstep(-0.12, 0.28, dot(n, solDireccion));
  vec3 color = mix(superficie * ladoNoche, superficie, luz);
  vec3 vista = normalize(cameraPosition - vPosicionMundo);
  float borde = pow(1.0 - max(dot(vista, n), 0.0), exponenteBorde);
  color += colorAcento * borde * luz * intensidadBorde;
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
  /** Cuánto se apaga la cara nocturna. 0.12 = noche cerrada pero no negra. */
  noche?: number;
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
        // Fija en el espacio, no en la cámara: es la decisión de 1.2.2.
        solDireccion: { value: new Vector3(2, 3, 4).normalize() },
        intensidadBorde: { value: opciones.intensidad ?? 0.35 },
        exponenteBorde: { value: opciones.exponente ?? 3.0 },
        ladoNoche: { value: opciones.noche ?? 0.12 },
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
    if (p.noche !== undefined) u.ladoNoche.value = p.noche;
  }

  dispose(): void {
    this.malla.geometry.dispose();
    this.material.dispose();
  }
}
