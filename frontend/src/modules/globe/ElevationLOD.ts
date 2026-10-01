/**
 * LOD de elevación (ROADMAP 1.3.1).
 *
 * El relief de 1.3.1 usa dos niveles de heightmap global: uno de baja resolución
 * (vista de planeta entero) y otro de detalle (acercamientos), y elige cuánto pesa
 * cada uno según la distancia de la cámara. El cruce es un `smoothstep`, así que el
 * criterio "sin caídas bruscas en LOD" se cumple por construcción: el peso cambia
 * de forma continua y no hay un salto de relieve.
 *
 * Los valores son calibración de este paso, no vienen fijados por ningún doc:
 *
 * - `DISTANCIA_DETALLE` 2.2 y `DISTANCIA_BASE` 3.6 radios: dentro de 2.2 el detalle
 *   pesa 1, a partir de 3.6 pesa 0, entre medias se cruza. La cámara orbital de
 *   1.1.2 se mueve entre 1.05 y 6 radios, así que el rango cubre todo su curso.
 * - `ESCALA_ELEVACION` 2,5e-6 radios por metro: el Everest (8848 m) mueve un 2,2 %
 *   del radio, es visible de verdad sin que el globo parezca "peludo".
 * - `NIVEL_MAR` (1.3.2) aplana lo que está bajo el nivel del mar: en la superficie
 *   terrestre los océanos son planos y la batimetría no hace hoyos — el mar lo
 *   dibuja F2 (módulo de océanos), no la tierra. El threshold entra como uniform
 *   `nivelMar` al shader, y `desplazamiento()` es su espejo CPU para tests.
 *
 * Desde 1.3.3 este módulo lleva también la escalera de mallas (`MALLAS`, `indiceMalla`):
 * el heightmap y la geometría son el mismo relieve visto por dos sitios, y comparten los
 * umbrales de distancia para que no cambien a la vez (ver la nota de `MALLAS`).
 */
export const DISTANCIA_DETALLE = 2.2;
export const DISTANCIA_BASE = 3.6;
export const ESCALA_ELEVACION = 2.5e-6;
export const NIVEL_MAR = 0;

/** Cuánto pesa el nivel alto de detalle a una distancia dada (0 = solo nivel bajo). */
export function pesoNivel(distancia: number): number {
  const t = Math.min(
    1,
    Math.max(
      0,
      (distancia - DISTANCIA_DETALLE) / (DISTANCIA_BASE - DISTANCIA_DETALLE),
    ),
  );
  const suave = t * t * (3 - 2 * t);
  return 1 - suave;
}

/** Metros de Terrarium → fracción de radio, con océanos aplanados (1.3.2). */
export function desplazamiento(metros: number): number {
  return Math.max(metros, NIVEL_MAR) * ESCALA_ELEVACION;
}

/**
 * Reparto de la rampa entre los tres niveles de DEM (ROADMAP 1.3.3).
 *
 * El z3 del runtime no inventa una banda nueva: parte en dos la rampa que 1.3.1 ya
 * validó. El par z1→z2 cruza en la primera mitad (`medio`) y el z2→z3 en la segunda
 * (`alto`), de forma que a mitad de rampa el z2 está completo —sin z1 colándose como
 * fantasma en la vista cercana— y al final manda el z3.
 *
 * Sin tercer nivel (la descarga del DEM cayó y el globo se queda con el asset z2) se
 * devuelve la rampa original tal cual: `medio` = p y `alto` = 0, que con los dos
 * samplers de 1.3.1 da exactamente el mismo relieve que antes de 1.3.3.
 *
 * El shader mezcla `mix(mix(z1, z2, medio), z3, alto)`: los tres pesos son
 * `(1−medio)(1−alto)`, `medio(1−alto)` y `alto`, y suman 1.
 */
export function mezclaTresNiveles(
  p: number,
  hayTercero: boolean,
): { medio: number; alto: number } {
  if (!hayTercero) {
    return { medio: p, alto: 0 };
  }
  return { medio: Math.min(2 * p, 1), alto: Math.max(2 * p - 1, 0) };
}

/** Un peldaño de la escalera de mallas, en segmentos de `SphereGeometry`. */
export interface MallaNivel {
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Escalera de mallas del relieve (ROADMAP 1.3.3, decisión del usuario del 30-09-2026).
 *
 * De la más gruesa a la más fina, siempre el doble de fina que la anterior. El espaciado
 * en el ecuador es `40075 / ancho` km: 157, 78 y 39 km. La malla de 1.2.1 (`128×64`,
 * 313 km por vértice) no podía dibujar una cordillera —los Andes miden 200 km de ancho—
 * y se retira; el peldaño más grueso ya es más fino que lo validado allí (0,07 px de
 * silueta contra el corte de 0,5 px), así que el criterio de 1.2.1 se cumple de sobra.
 *
 * El cruce va en las bandas que 1.3.1 ya validó para el heightmap, y ahí está el detalle
 * que lo hace barato: en `DISTANCIA_BASE` el peso del nivel alto vale 0 y en
 * `DISTANCIA_DETALLE` vale 1, así que la malla cambia cuando el cruce de heightmaps está
 * saturado y nunca se reconstruye la geometría con el relieve a medio cruzar.
 */
export const MALLAS: readonly MallaNivel[] = [
  { ancho: 256, alto: 128 }, // 157 km por vértice
  { ancho: 512, alto: 256 }, // 78 km
  { ancho: 1024, alto: 512 }, // 39 km
];

/** Umbral entre el peldaño `i` y el `i+1`, de gruesa a fina. Los de la escalera de arriba. */
const UMBRALES_MALLA: readonly number[] = [DISTANCIA_BASE, DISTANCIA_DETALLE];

/**
 * Margen de histéresis de la escalera, en radios de cámara.
 *
 * Sin él, una cámara parada justo en un umbral reconstruiría la geometría —y subiría 36 MB
 * a la GPU— cada vez que el temblor del `wheel` o el amortiguado cruzara el umbral en un
 * sentido y en el otro. Con margen, el peldaño puesto solo cambia si la distancia se aleja
 * 0,05 radios del umbral. ponytail: si algún día se nota el retardo al cruzar, este es el
 * número que baja.
 */
export const MARGEN_MALLA = 0.05;

/**
 * Peldaño que toca a `distancia`, partiendo del que ya está puesto (`indiceActual`).
 *
 * Con histéresis: para pasar a uno más fino hay que bajar del umbral, no solo tocarlo.
 * Los tests recorren los cuatro cruces de cada umbral con y sin margen.
 */
export function indiceMalla(distancia: number, indiceActual = 0): number {
  let i = Math.min(Math.max(indiceActual, 0), MALLAS.length - 1);
  while (
    i + 1 < MALLAS.length &&
    distancia <= UMBRALES_MALLA[i] - MARGEN_MALLA
  ) {
    i++;
  }
  while (i > 0 && distancia >= UMBRALES_MALLA[i - 1] + MARGEN_MALLA) i--;
  return i;
}
