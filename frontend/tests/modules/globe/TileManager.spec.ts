/**
 * TileManager — descarga, empacado en atlas y cruce de niveles (ROADMAP 1.4.1).
 *
 * La unidad se prueba con dependencias inyectadas: sin red (`cargarImagen`
 * fingido), sin canvas real (`componerAtlas` devuelve un canvas de jsdom que
 * nunca se sube a GPU en tests) y con URLs clavadas. Los tres niveles se
 * descargan completos — todo o nada — y `sincronizar` deja los uniforms del
 * cruce para la distancia pedida (misma tabla que `nivelesConFade`).
 */
import { CanvasTexture, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import { TileManager } from "../../../src/modules/globe/TileManager";

const imagenFalsa = {} as ImageBitmap;
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

    // z0 y z1 siguen vivos (se ven lejos), z2 no existe (se ve de cerca nada).
    gestionado.sincronizar(6);
    const u = gestionado["material"].uniforms;
    expect(u.u_tieneAtlas.value).toBe(1);
    expect(u.u_atlasA.value).toBeInstanceOf(CanvasTexture);
    gestionado.sincronizar(1.5);
    expect(u.u_tieneAtlas.value).toBe(0);
    expect(u.u_atlasA.value).toBeNull();
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

  it("cerca (< 2.2) usa el nivel 2", async () => {
    const { gestionado } = nuevoManager();
    await gestionado.precargar();
    gestionado.sincronizar(1.5);
    const u = gestionado["material"].uniforms;
    expect(u.u_atlasB.value).toBe(u.u_atlasA.value);
    expect(u.u_cruce.value).toBe(0);
    expect(u.u_tieneAtlas.value).toBe(1);
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
