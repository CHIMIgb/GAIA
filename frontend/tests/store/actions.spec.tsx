/**
 * Criterio ROADMAP 0.4.1 contra el store tal como lo fija `GAIA_STATE.md`:
 * mutaciones desde 2 componentes comparten estado, y las acciones async
 * actualizan los flags. La forma del store y el catálogo de acciones están
 * prescritos en §2.2, §2.3 y §6.1; aquí se comprueban, no se eligen.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useSnapshot } from "valtio";
import { snapshot } from "valtio/vanilla";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearSelection,
  selectObject,
  setConnectionStatus,
  setSeaLevel,
  setTimeFilter,
  toggleLayer,
} from "../../src/store/actions";
import { state } from "../../src/store/index";
import type { SelectedObject } from "../../src/store/state.types";

const fire: SelectedObject = {
  type: "fire",
  instanceId: 12,
  lat: -12.4,
  lon: -54.3,
  data: { frpMwKm2: 4.2 },
};

/** Escribe en el store (como haría LayerControls). */
function LayerToggle() {
  const snap = useSnapshot(state);
  return (
    <button onClick={() => toggleLayer("fire")}>
      fire:{String(snap.layers.fire)}
    </button>
  );
}

/** Solo lee: no comparte código con el anterior, solo el store. */
function StatusBadge() {
  const status = useSnapshot(state).connectionStatus.fires;
  return <span>{`${status.state}/${status.lastError ?? "-"}`}</span>;
}

afterEach(() => {
  // Sin `globals: true`, @testing-library/react no registra su cleanup automático
  // y el DOM del test anterior se acumula.
  cleanup();

  // El store es un singleton a propósito y las acciones lo mutan en sitio, así que
  // hay que devolverlo al estado inicial entre tests.
  state.selectedObject = null;
  state.telemetry.open = false;
  state.telemetry.pinned = false;
  state.layers.fire = false;
  state.flood.seaLevel = 0;
  state.filters.timeRange = "24h";
  Object.assign(state.connectionStatus.fires, {
    state: "error",
    lastUpdate: null,
    cachedAt: null,
    lastError: "Sin respuesta inicial de fires",
  });
});

describe("estado compartido entre componentes", () => {
  // `subscribe()` de Valtio agrupa la notificación en un microtask, y el `act`
  // síncrono de `fireEvent` no lo vacía: sin el `await`, el re-render ocurre
  // después de la aserción y el test pasa por casualidad o falla sin razón.
  it("una mutación de un componente se ve en el otro", async () => {
    render(
      <>
        <LayerToggle />
        <StatusBadge />
      </>,
    );
    expect(screen.getByRole("button").textContent).toBe("fire:false");

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    // El mismo click cambia los dos: estado compartido, no dos copias.
    expect(screen.getByRole("button").textContent).toBe("fire:true");
    expect(snapshot(state).layers.fire).toBe(true);
  });

  it("el panel de telemetría se abre al seleccionar desde el canvas", () => {
    render(<StatusBadge />);
    expect(snapshot(state).telemetry.open).toBe(false);

    selectObject(fire);

    expect(snapshot(state).selectedObject?.type).toBe("fire");
    expect(snapshot(state).telemetry.open).toBe(true);
    expect(snapshot(state).telemetry.pinned).toBe(false);

    clearSelection();

    expect(snapshot(state).selectedObject).toBeNull();
    expect(snapshot(state).telemetry.open).toBe(false);
  });
});

describe("acciones async actualizan los flags", () => {
  it("loading -> live rellena lastUpdate", async () => {
    setConnectionStatus("fires", { state: "loading" });
    expect(snapshot(state).connectionStatus.fires.state).toBe("loading");

    // Lo que hará el cliente API del paso 0.4.2 al resolverse la petición.
    // `lastError: null` va explícito: §6.1 define la acción como merge parcial, así
    // que no limpia campos sola (la tabla de §6.3 describe qué debe pasar el dato).
    await Promise.resolve();
    setConnectionStatus("fires", {
      state: "live",
      lastUpdate: 1_700_000_000_000,
      lastError: null,
    });

    const snap = snapshot(state);
    expect(snap.connectionStatus.fires.state).toBe("live");
    expect(snap.connectionStatus.fires.lastUpdate).toBe(1_700_000_000_000);
    expect(snap.connectionStatus.fires.lastError).toBeNull();
    // El badge del otro componente refleja el mismo estado.
    render(<StatusBadge />);
    expect(screen.getByText("live/-").textContent).toBe("live/-");
  });

  it("un fallo deja el estado en error con el mensaje del contrato", async () => {
    await Promise.resolve();
    setConnectionStatus("fires", {
      state: "error",
      lastError: "UPSTREAM_TIMEOUT",
    });

    expect(snapshot(state).connectionStatus.fires.state).toBe("error");
    expect(snapshot(state).connectionStatus.fires.lastError).toBe(
      "UPSTREAM_TIMEOUT",
    );
  });

  it("el merge parcial no pisa los campos que no se pasan", () => {
    setConnectionStatus("fires", {
      state: "live",
      lastUpdate: 1_700_000_000_000,
    });
    setConnectionStatus("fires", { state: "loading" });

    expect(snapshot(state).connectionStatus.fires.lastUpdate).toBe(
      1_700_000_000_000,
    );
  });
});

describe("acciones puras", () => {
  it("clampa el nivel del mar a [0, 10]", () => {
    setSeaLevel(-3);
    expect(snapshot(state).flood.seaLevel).toBe(0);
    setSeaLevel(15);
    expect(snapshot(state).flood.seaLevel).toBe(10);
  });

  it("el rango temporal por defecto es 24h", () => {
    expect(snapshot(state).filters.timeRange).toBe("24h");
    setTimeFilter("7d");
    expect(snapshot(state).filters.timeRange).toBe("7d");
  });

  it("arranca sin datos: todos los módulos en error y sin última actualización", () => {
    const snap = snapshot(state);
    expect(snap.connectionStatus.fires).toEqual({
      state: "error",
      lastUpdate: null,
      cachedAt: null,
      lastError: "Sin respuesta inicial de fires",
    });
    expect(snap.layers).toEqual({
      fire: false,
      wind: false,
      seismic: false,
      flood: false,
      radiation: false,
    });
  });
});
