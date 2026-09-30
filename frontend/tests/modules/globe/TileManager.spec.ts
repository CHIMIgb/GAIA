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
 */
import { CanvasTexture, ShaderMaterial } from "three";
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
    componerAtlas: vi.fn((_tiles, lado) => {
      // Sin jsdom ni canvas: la textura solo se sube a GPU en el renderer real.
      return { width: 256 * lado, height: 256 * lado } as HTMLCanvasElement;
    }),
  });
  return {
    gestionado,
    deps: gestionado["deps"] as Record<string, ReturnType<typeof vi.fn>>,
  };
};

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

describe("TileManager — niveles de contacto perezosos (z3/z4)", () => {
  it("no los precarga: los pide al acercarse la cámara", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    expect(urls(deps)).toHaveLength(21); // solo los tres base

    // 1.5 está en la banda pura de z4: pide sus 256 tiles, y solo esos.
    gestionado.sincronizar(1.5);
    await vi.waitFor(() => expect(urls(deps)).toHaveLength(21 + 256));
    expect(urls(deps).some((u) => u.startsWith("https://tile.test/4/"))).toBe(
      true,
    );

    // El atlas de z4 (4096²) queda en pantalla.
    const u = gestionado["material"].uniforms;
    await vi.waitFor(() =>
      expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture),
    );
    expect(u.u_tieneAtlas.value).toBe(1);
    expect(u.u_cruce.value).toBe(0);

    // Y se compuso con los 256 tiles y su lado 16: un atlas en negro no serviría
    // de nada, y es lo que sale si el mapa que se compone llega vacío.
    const [mapaCompuesto, ladoCompuesto] =
      deps.componerAtlas.mock.calls.at(-1)!;
    expect((mapaCompuesto as Map<string, ImageBitmap>).size).toBe(256);
    expect(ladoCompuesto).toBe(16);
    gestionado.dispose();
  });

  it("pide z3 solo si la cámara se para en su banda [1.9, 2.2)", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(2.05);
    await vi.waitFor(() => expect(urls(deps)).toHaveLength(21 + 64));
    expect(urls(deps).some((u) => u.startsWith("https://tile.test/3/"))).toBe(
      true,
    );
    expect(urls(deps).some((u) => u.startsWith("https://tile.test/4/"))).toBe(
      false,
    );
    gestionado.dispose();
  });

  it("no guarda los tiles sueltos de los niveles profundos (el atlas ya los tiene)", async () => {
    const { gestionado, deps } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.5);
    await vi.waitFor(
      () => expect(deps.componerAtlas).toHaveBeenCalledTimes(4), // z0, z1, z2 y z4
    );
    await vi.waitFor(() => expect(gestionado["tiles"].size).toBe(21));
    // Solo los tres base siguen en caché; los 256 tiles de z4 se liberaron ya.
    expect(imagenFalsa.close).toHaveBeenCalled();
    gestionado.dispose();
  });

  it("mientras z3 no llega, sigue pintando con z2 (no se queda a color base)", async () => {
    const { gestionado } = nuevoManager((u) =>
      u.startsWith("https://tile.test/3/"),
    );
    await gestionado.precargar();
    gestionado.sincronizar(2.0); // banda de z3, que aún no existe
    const u = gestionado["material"].uniforms;
    expect(u.u_tieneAtlas.value).toBe(1);
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture); // el de z2
    expect(u.u_cruce.value).toBe(0); // sin z3 no hay mezcla
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
  it("lejos (≥ 4.5) usa el nivel 0 en ambas puntas, sin cruce", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(6);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture);
    expect(u.u_atlasB.value).toBe(u.u_atlasA.value);
    expect(u.u_cruce.value).toBe(0);
    expect(u.u_tieneAtlas.value).toBe(1);
  });

  it("en la banda [3.6, 4.5) cruza del nivel 1 al 0 con el peso de la tabla", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(3.8);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasA.value).not.toBe(u.u_atlasB.value);
    expect(u.u_cruce.value).toBeCloseTo(0.2222, 3);
    expect(u.u_tieneAtlas.value).toBe(1);
  });

  it("cerca, dentro de la banda de z3, usa el nivel 2 mientras el otro llega", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
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
