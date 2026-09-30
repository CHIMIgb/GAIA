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
 * El desplazamiento por altura de 1.3.1 y la textura de 1.4.1 entran por el uniform
 * `textura`, que hoy no se usa: está declarado para que el shader no cambie de forma
 * cuando la textura llegue.
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
 * `vertexShader`: pasa la normal analítica y la posición a espacio de mundo. En mundo,
 * porque la dirección del sol es un uniform de mundo y normal y sol tienen que compararse
 * en el mismo espacio o el terminador sale torcido al mover la malla.
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
 *      `textura` queda declarado para que 1.4.1 no cambie la forma del shader.
 */
const vertexShader = /* glsl */ `
varying vec3 vNormalMundo;
varying vec3 vPosicionMundo;
void main() {
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  vPosicionMundo = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 colorTierra;
uniform vec3 colorAcento;
uniform vec3 solDireccion;
uniform float intensidadBorde;
uniform float exponenteBorde;
uniform float ladoNoche;
uniform sampler2D textura;
varying vec3 vNormalMundo;
varying vec3 vPosicionMundo;
void main() {
  vec3 n = normalize(vNormalMundo);
  float luz = smoothstep(-0.12, 0.28, dot(n, solDireccion));
  vec3 color = mix(colorTierra * ladoNoche, colorTierra, luz);
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
        textura: { value: null },
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
