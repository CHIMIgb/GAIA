/**
 * TileManager — descarga, empacado en atlas y cruce de niveles (ROADMAP 1.4.1).
 *
 * La unidad se prueba con dependencias inyectadas: sin red (`cargarImagen`
 * fingido), sin canvas real (`componerAtlas` devuelve un canvas de jsdom que
 * nunca se sube a GPU en tests) y con URLs clavadas. Los tres niveles base se
 * descargan completos — todo o nada — y `sincronizar` deja los uniforms del
 * cruce para la distancia pedida (misma tabla que `nivelesConFade`). Los niveles
 * de contacto z3/z4 no se precargan: se piden desde `sincronizar` y, mientras
 * llegan, el globo se queda con el nivel anterior.
 *
 * El nivel z6 es un atlas de vista: con cámara en `sincronizar` baja solo el
 * rectángulo de tiles que la pantalla cubre, lo empaca en un atlas `cols×rows` y
 * manda su rectángulo mercator en `u_rectA`. Sin cámara no hay cap y todo sigue
 * con los atlas globales.
 */
import { CanvasTexture, ShaderMaterial, Vector3, Vector4 } from "three";
import { describe, expect, it, vi } from "vitest";

import { TileManager } from "../../../src/modules/globe/TileManager";

const imagenFalsa = { close: vi.fn() } as unknown as ImageBitmap;
const urls = (deps: Record<string, ReturnType<typeof vi.fn>>) =>
  deps.cargarImagen.mock.calls.map((c) => c[0] as string);
const material = () =>
  new ShaderMaterial({
    uniforms: {
      u_atlasA: { value: null },
      u_atlasB: { value: null },
      u_rectA: { value: new Vector4(0, 0, 1, 1) },
      u_cruce: { value: 0 },
      u_tieneAtlas: { value: 0 },
    },
  });

const nuevoManager = (fallaEn?: (url: string) => boolean) => {
  const gestionado = new TileManager(material(), {
    url: (z, y, x) => `https://tile.test/${z}/${y}/${x}`,
    cargarImagen: vi.fn(async (url: string) => {
      if (fallaEn?.(url)) throw new Error(`tile caído ${url}`);
      return imagenFalsa;
    }),
    componerAtlas: vi.fn((_tiles, cols, rows) => {
      // Sin jsdom ni canvas: la textura solo se sube a GPU en el renderer real.
      return { width: 256 * cols, height: 256 * rows } as HTMLCanvasElement;
    }),
  });
  return {
    gestionado,
    deps: gestionado["deps"] as Record<string, ReturnType<typeof vi.fn>>,
  };
};

/** Cámara mínima que necesita el atlas de vista (la que `TileManager` recibe por frame). */
const camara = (x: number, y: number, z: number, fov = 45) => ({
  position: new Vector3(x, y, z),
  fov,
  aspect: 16 / 9,
});

describe("TileManager — descarga y empacado (ROADMAP 1.4.1)", () => {
  it("precarga los tres niveles (1 + 4 + 16 tiles) y compone un atlas por nivel", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    const pedidas = urls(deps);

    expect(pedidas).toHaveLength(21);
    expect(pedidas[0]).toBe("https://tile.test/0/0/0");
    expect(pedidas).toContain("https://tile.test/2/1/3"); // orden {z}/{y}/{x}
    // Un nivel por zoom, con su lado (1, 2 y 4 tiles por fila).
    expect(deps.componerAtlas).toHaveBeenCalledTimes(3);
    const lados = deps.componerAtlas.mock.calls.map((c) => c[1]);
    expect(lados).toEqual([1, 2, 4]);
  });

  it("es idempotente: una segunda precarga no vuelve a descargar", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    await gestionado.precargar();
    expect(deps.cargarImagen.mock.calls).toHaveLength(21);
  });

  it("un tile caído tumba el nivel entero (todo o nada) sin romper los demás", async () => {
    const { gestionado } = nuevoManager((u) => u === "https://tile.test/2/3/3");
    await expect(gestionado.precargar()).resolves.toBeUndefined();

    // z0 y z1 siguen vivos (se ven lejos), z2 no existe.
    gestionado.sincronizar(6);
    const u = gestionado["material"].uniforms;
    expect(u.u_tieneAtlas.value).toBe(1);
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture);
    // De cerca (banda de z4) se cae al nivel anterior disponible (z1), no al color base.
    gestionado.sincronizar(1.5);
    expect(u.u_tieneAtlas.value).toBe(1);
    gestionado.dispose();
  });
});

describe("TileManager — atlas de vista en vez de atlas del mundo entero", () => {
  it("por debajo de 2 radios no pide ningún atlas global, solo el de vista", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();

    // El zoom por defecto (1.8) entra directamente en la banda del atlas de vista: z3 y
    // z4 ya no existen en la escalera, así que no se piden ni se componen.
    gestionado.sincronizar(1.8, camara(0, 0, 1.8));
    await vi.waitFor(
      () => expect(deps.componerAtlas).toHaveBeenCalledTimes(4), // z0, z1, z2 y el cap
    );
    // El nivel va en el segmento 4 de la URL ({z}/{y}/{x}); buscar "/3/" a pelo también
    // casaría con la columna x=3 de un tile de z5.
    const niveles = urls(deps).map((u) => u.split("/")[3]);
    expect(niveles.some((z) => z === "3" || z === "4")).toBe(false);
    // El atlas de vista se compone con su rectángulo, no como el mundo entero.
    const [, cols, rows] = deps.componerAtlas.mock.calls.at(-1)!;
    expect(cols * rows).toBeLessThan(256);
    gestionado.dispose();
  });

  it("no guarda los tiles sueltos del atlas de vista (el atlas ya los tiene)", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.8, camara(0, 0, 1.8));
    await vi.waitFor(
      () => expect(deps.componerAtlas).toHaveBeenCalledTimes(4), // z0, z1, z2 y el cap
    );
    await vi.waitFor(() => expect(gestionado["tiles"].size).toBe(21));
    // Solo los tres base siguen en caché; los tiles del cap se liberan al componer.
    expect(imagenFalsa.close).toHaveBeenCalled();
    gestionado.dispose();
  });

  it("mientras el atlas de vista no llega, sigue pintando con z2 (no a color base)", async () => {
    const { gestionado } = nuevoManager(
      (u) => !u.startsWith("https://tile.test/1/"),
    );
    await gestionado.precargar();
    gestionado.sincronizar(1.8, camara(0, 0, 1.8)); // banda del cap, que aún no existe
    const u = gestionado["material"].uniforms;
    expect(u.u_tieneAtlas.value).toBe(1);
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture); // el de z2
    expect(u.u_cruce.value).toBe(0); // sin cap no hay mezcla
    gestionado.dispose();
  });

  it("reintenta un tile que se cayó una vez y completa el nivel entero", async () => {
    let caidos = 0;
    const { gestionado, deps } = nuevoManager((u) => {
      if (u !== "https://tile.test/0/0/0") return false;
      caidos++;
      return caidos === 1; // solo se cae la primera vez
    });
    await gestionado.precargar();

    // El reintento recupera el tile: los tres niveles quedan listos.
    expect(caidos).toBe(2);
    expect(deps.componerAtlas).toHaveBeenCalledTimes(3);
    gestionado.dispose();
  });

  it("un nivel perdido no se relanza en cada frame (espera 30 s)", async () => {
    const { gestionado, deps } = nuevoManager(
      (u) => u === "https://tile.test/0/0/0", // z0 nunca llega
    );
    await gestionado.precargar();
    const caidos = () =>
      urls(deps).filter((u) => u === "https://tile.test/0/0/0").length;
    expect(caidos()).toBe(2); // el intento y su reintento

    // `sincronizar` corre en cada frame: sin enfriamiento esto serían 2 peticiones
    // más de z0 en el frame siguiente, y así hasta el infinito.
    gestionado.sincronizar(6);
    gestionado.sincronizar(6);
    expect(caidos()).toBe(2);
    gestionado.dispose();
  });
});

describe("TileManager — cruce de niveles por distancia (ROADMAP 1.4.1)", () => {
  it("lejos cruza de z1 a z0 y desde 7 solo queda el nivel 0", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    // Escalera: z1 cubre [5.6, 7.0). A 6 ya se ve z0 debajo, mezclado con peso 0,29.
    gestionado.sincronizar(6);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture);
    expect(u.u_atlasB.value).not.toBe(u.u_atlasA.value);
    expect(u.u_cruce.value).toBeCloseTo(0.2857, 3);
    expect(u.u_tieneAtlas.value).toBe(1);
    // Desde 7 el nivel de partida ya es z0 puro: las dos puntas son el mismo atlas.
    gestionado.sincronizar(7);
    expect(u.u_atlasB.value).toBe(u.u_atlasA.value);
    expect(u.u_cruce.value).toBe(0);
  });

  it("en la banda [4.5, 5.6) cruza del nivel 2 al 1 con el peso de la tabla", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(5.0);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasA.value).not.toBe(u.u_atlasB.value);
    expect(u.u_cruce.value).toBeCloseTo(0.4545, 3);
    expect(u.u_tieneAtlas.value).toBe(1);
  });

  it("en la banda del cap, si el nivel pedido no llegó se pinta el más fino cargado", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    // A 2,0 toca cap (z6) con reserva z4, pero ninguno de los dos se ha descargado todavía:
    // `atlasDe` cae al nivel global cargado más fino (z2) y se queda sin mezcla ni hueco.
    gestionado.sincronizar(2.0);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasB.value).toBe(u.u_atlasA.value);
    expect(u.u_cruce.value).toBe(0);
    expect(u.u_tieneAtlas.value).toBe(1);
    gestionado.dispose();
  });

  it("si el nivel lejano del cruce aún no está, se queda con el cercano sin mezclar", async () => {
    const { gestionado } = nuevoManager((u) =>
      u.startsWith("https://tile.test/0/"),
    );
    // Solo z1 y z2 se descargan; z0 (nivel B del cruce lejano) nunca llega.
    await gestionado.precargar();
    gestionado.sincronizar(3.8);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture); // z1 listo
    expect(u.u_cruce.value).toBe(0); // sin B no hay fade
    expect(u.u_tieneAtlas.value).toBe(1); // pero A sí se muestra
  });

  it("dispose libera texturas y deja de pintar", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    vi.spyOn(CanvasTexture.prototype, "dispose");
    gestionado.dispose();
    gestionado.sincronizar(6);
    const u = gestionado["material"].uniforms;
    expect(CanvasTexture.prototype.dispose).toHaveBeenCalledTimes(3);
    expect(u.u_tieneAtlas.value).toBe(0);
  });
});

describe("TileManager — atlas de vista (cap)", () => {
  /**
   * Cámara sobre el ecuador en lon 0 y a 1.4 radios: el rectángulo de vista es el de
   * `rectDeCap(7, {lat:0,lon:0}, 1.4, 22.5, 16/9)` — z7 es el nivel más detallado que
   * cabe en el atlas con tiles de 256 px.
   */
  const deZ7 = (deps: Record<string, ReturnType<typeof vi.fn>>) =>
    urls(deps).filter((u) => u.includes("/7/"));

  it("en el zoom de contacto baja solo el rectángulo que ve la pantalla", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));

    // 19×12 = 228 tiles de z7, no los 16384 de un atlas global de ese nivel (y muchos
    // menos que los 256 del z4 global que ya se descarga al bajar de 1.65).
    await vi.waitFor(() => expect(deZ7(deps)).toHaveLength(228));
    expect(deZ7(deps)).toContain("https://tile.test/7/58/55"); // orden {z}/{y}/{x}

    const u = gestionado["material"].uniforms;
    await vi.waitFor(() =>
      expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture),
    );
    // El cap se sube asíncrono, así que el uniform del rectángulo lo fija el frame
    // siguiente (en la app, los 60 por segundo de `onBeforeRender`).
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));
    expect(u.u_tieneAtlas.value).toBe(1);
    // El rectángulo mercator del cap viaja en u_rectA (x=u0, z=ancho), que es lo que
    // le dice al shader qué parte del atlas es real.
    expect(u.u_rectA.value.x).toBeCloseTo(55 / 128, 6);
    expect(u.u_rectA.value.z).toBeCloseTo(19 / 128, 6);
    // Y el atlas global se queda en B, que es lo que se ve fuera del rectángulo.
    expect(u.u_atlasB.value).toBeInstanceOf(CanvasTexture);
    expect(u.u_atlasA.value).not.toBe(u.u_atlasB.value);
    expect(u.u_cruce.value).toBe(0); // zona pura de z6

    // El atlas sale apaisado y anclado a su origen en el nivel.
    const [, cols, rows, x0, y0] = deps.componerAtlas.mock.calls.at(-1)!;
    expect([cols, rows, x0, y0]).toEqual([19, 12, 55, 58]);
    gestionado.dispose();
  });

  it("sin cámara no hay cap: sigue con los atlas globales", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.4);

    expect(deZ7(deps)).toHaveLength(0);
    const u = gestionado["material"].uniforms;
    await vi.waitFor(() =>
      expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture),
    );
    expect(u.u_rectA.value.toArray()).toEqual([0, 0, 1, 1]); // mundo entero
    gestionado.dispose();
  });

  it("un tile caído tumba el cap y el globo se queda con el atlas global", async () => {
    // Solo el nivel del cap en el contacto (z7, el segmento 4 de la URL), que en x7
    // también casaría con z3/z4.
    const { gestionado, deps } = nuevoManager((u) => u.split("/")[3] === "7");
    await gestionado.precargar();
    // Primero un atlas global (a 2.5 radios la banda pura es z2), que es la reserva.
    gestionado.sincronizar(2.5);
    await vi.waitFor(() =>
      expect(
        urls(deps).filter((t) => t.startsWith("https://tile.test/2/")),
      ).toHaveLength(16),
    );
    const u = gestionado["material"].uniforms;
    await vi.waitFor(() =>
      expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture),
    );

    // Ahora el cap, que se cae entero (todo o nada).
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));
    await vi.waitFor(() => expect(deZ7(deps).length).toBeGreaterThan(0));
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));

    expect(u.u_atlasA.value).toBe(u.u_atlasB.value); // los dos slots con z4
    expect(u.u_rectA.value.toArray()).toEqual([0, 0, 1, 1]); // mundo entero
    expect(u.u_cruce.value).toBe(0);
    expect(u.u_tieneAtlas.value).toBe(1); // ni hueco negro ni color base
    gestionado.dispose();
  });

  it("el cap que cruza el antimeridiano pide las columnas de la vuelta y las empaqueta en orden", async () => {
    // 1.4.2: la cámara en lon 179 saca el rectángulo por la derecha (x0=119 y 19 columnas
    // en z7 entran 119..127 y 0..9). Hay que pedirlas, y componerlas en su sitio: si el
    // atlas las dibujara en (x - x0) saldrían del lienzo y quedarían huecos.
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    const a = (-179 * Math.PI) / 180; // lon -179°, el otro lado del borde fecha
    gestionado.sincronizar(
      1.4,
      camara(1.4 * Math.sin(a), 0, 1.4 * Math.cos(a)),
    );

    await vi.waitFor(() => expect(deZ7(deps)).toHaveLength(228));
    expect(deZ7(deps)).toContain("https://tile.test/7/58/0"); // columna x=0: la vuelta
    expect(deZ7(deps)).toContain("https://tile.test/7/58/127"); // y el borde este
    // El atlas se compone con su origen, y las columnas de la vuelta son las últimas.
    const [, cols, rows, x0, y0] = deps.componerAtlas.mock.calls.at(-1)!;
    expect([cols, rows, x0, y0]).toEqual([19, 12, 119, 58]);
    expect(x0 + cols).toBeGreaterThan(128);
    // Y el uniform del rectángulo lo dice para que el shader pueda dar la vuelta.
    const u = gestionado["material"].uniforms;
    await vi.waitFor(() =>
      expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture),
    );
    gestionado.sincronizar(
      1.4,
      camara(1.4 * Math.sin(a), 0, 1.4 * Math.cos(a)),
    );
    expect(u.u_rectA.value.x).toBeCloseTo(119 / 128, 6);
    expect(u.u_rectA.value.z).toBeCloseTo(19 / 128, 6);
    expect(u.u_rectA.value.x + u.u_rectA.value.z).toBeGreaterThan(1);
    gestionado.dispose();
  });

  it("no recompone el mismo rectángulo y solo lo rehace si la cámara sale de él", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));
    await vi.waitFor(() => expect(deZ7(deps)).toHaveLength(228));

    // `sincronizar` corre por frame: con la cámara quieta no se vuelve a pedir nada.
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));
    gestionado.sincronizar(1.4, camara(0, 0, 1.4));
    expect(deZ7(deps)).toHaveLength(228);

    // La cámara se va 30° al este: otro rectángulo, otras peticiones.
    gestionado.sincronizar(
      1.4,
      camara(1.4 * Math.sin(0.5236), 0, 1.4 * Math.cos(0.5236)),
    );
    await vi.waitFor(() => expect(deZ7(deps)).toHaveLength(456));
    gestionado.dispose();
  });
});

it("cuando todos los niveles fallan, el globo se queda con el color base", async () => {
  const { gestionado } = nuevoManager(() => true); // todos caen
  await gestionado.precargar();
  gestionado.sincronizar(3);
  const u = gestionado["material"].uniforms;
  expect(u.u_tieneAtlas.value).toBe(0);
  gestionado.dispose();
});
