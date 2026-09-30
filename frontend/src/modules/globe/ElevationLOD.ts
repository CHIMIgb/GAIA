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
