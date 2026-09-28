"""Criterio ROADMAP 0.7.2: la duración por endpoint (nominal/p95) es visible en los logs
del backend, y solo en dev.

La matemática se prueba directa sobre `registra`; que el middleware la llame y que la
puerta `DEBUG` la cierre se prueba con peticiones de verdad.
"""

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import timing
from app.services.timing import MAX_ENDPOINTS, WINDOW_SAMPLES, log_duracion, registra

RUTA = "/api/_rl-probe"


@pytest.fixture(autouse=True)
def ventanas_limpias():
    timing.reset()
    yield
    timing.reset()


class TestCalculo:
    def test_sin_muestras_no_hay_linea(self):
        # La ruta no existe todavía: primero la crea la primera muestra.
        assert registra("GET", RUTA, 5.0) == f"GET {RUTA} avg=5.0ms p95=5.0ms n=1"

    def test_el_promedio_es_la_media_de_la_ventana(self):
        linea = ""
        for ms in (10.0, 20.0, 30.0):
            linea = registra("GET", RUTA, ms)
        # avg = (10 + 20 + 30) / 3 = 20; floor(3 x 0.95) = 2, la mayor de las tres.
        assert "avg=20.0ms p95=30.0ms n=3" in linea

    def test_la_p95_saca_la_cola_del_5_por_ciento(self):
        # 19 muestras de 10 ms y una de 200: floor(20 x 0.95) = 19, o sea el máximo, así
        # que la p95 tiene que reportar los 200 ms. La mediana daría 10.
        for _ in range(19):
            registra("GET", RUTA, 10.0)
        linea = registra("GET", RUTA, 200.0)

        # El promedio se infla a 19.5 ms y la p95 ve la cola: son dos números distintos.
        assert "avg=19.5ms" in linea
        assert "p95=200.0ms" in linea

    def test_un_pico_aislado_no_llega_a_la_p95(self):
        # Con 40 muestras el índice 38 cae por debajo del máximo: un único frame (petición)
        # de 200 ms entre 39 de 10 ms no define el percentil 95.
        for _ in range(39):
            registra("GET", RUTA, 10.0)
        linea = registra("GET", RUTA, 200.0)

        assert "avg=14.8ms" in linea  # (39 x 10 + 200) / 40
        assert "p95=10.0ms" in linea

    def test_la_ventana_no_crece_sin_limite(self):
        for _ in range(WINDOW_SAMPLES + 50):
            registra("GET", RUTA, 10.0)

        assert f"n={WINDOW_SAMPLES}" in registra("GET", RUTA, 10.0)

    def test_solo_mide_rutas_de_la_api(self):
        # Los assets y `/docs` no dicen nada del coste de un endpoint.
        assert registra("GET", "/docs", 12.0) is None
        assert registra("GET", "/assets/index.js", 12.0) is None

    def test_las_claves_del_endpoint_estan_topadas(self):
        # La ruta viene de la URL: sin tope, un escáner de rutas crece la memoria.
        for i in range(MAX_ENDPOINTS):
            assert registra("GET", f"/api/x{i}", 1.0) is not None
        assert registra("GET", "/api/x-extra", 1.0) is None


class TestVisibleEnLogs:
    def test_en_dev_escribe_la_linea(self, client: TestClient, caplog):
        with caplog.at_level(logging.INFO), pytest.MonkeyPatch.context() as mp:
            mp.setattr(settings, "DEBUG", True)
            client.get(RUTA)

        duraciones = [r for r in caplog.records if r.message.startswith("duración")]
        assert len(duraciones) == 1
        assert RUTA in duraciones[0].message
        assert "avg=" in duraciones[0].message
        assert "p95=" in duraciones[0].message

    def test_sin_debug_no_escribe_nada(self, client: TestClient, caplog):
        with caplog.at_level(logging.INFO), pytest.MonkeyPatch.context() as mp:
            mp.setattr(settings, "DEBUG", False)
            client.get(RUTA)

        assert not [r for r in caplog.records if r.message.startswith("duración")]

    def test_el_endpoint_y_el_metodo_vienen_de_la_peticion(self):
        assert registra("POST", "/api/fires", 3.0).startswith("POST /api/fires ")

    def test_log_duracion_respeta_la_puerta_debug(self, caplog):
        with caplog.at_level(logging.INFO), pytest.MonkeyPatch.context() as mp:
            mp.setattr(settings, "DEBUG", False)
            log_duracion("GET", RUTA, 1.0)
        assert not [r for r in caplog.records if r.message.startswith("duración")]
