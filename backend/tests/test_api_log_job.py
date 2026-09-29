"""El job de limpieza que programa el cron de DEPLOYMENT §3.2, sin tocar la BD.

Los tests de `test_api_log_db.py` sí comprueban el `DELETE` por antigüedad, pero se
saltan sin PostgreSQL, que es justo lo que pasa en el CI. Estos dos van sin base de
datos: comprueban el comando que programa el cron y el valor de retención, que si no
se queda sin vigilar mientras los tests de BD están en verde-mentira.
"""

import asyncio

from app.db import api_log_store
from app.db.api_log_store import RETENTION_DAYS


def test_el_comando_del_job_purga_e_informa(capsys, monkeypatch) -> None:
    """`python -m app.db.api_log_store` es lo que llama el cron; sin este test, que se
    rompe, el cron se come un fallo y el log crece sin que nadie se entere."""

    async def _purga() -> int:
        return 37

    async def _cuenta() -> int:
        return 1289

    monkeypatch.setattr(api_log_store, "purge_api_log", _purga)
    monkeypatch.setattr(api_log_store, "count_api_log", _cuenta)

    asyncio.run(api_log_store._main())

    salida = capsys.readouterr().out
    assert "37" in salida
    assert "1289" in salida


def test_la_retencion_del_log_son_los_90_dias_del_doc() -> None:
    """El valor va escrito aquí a mano, no leído del código.

    Los tests de purga calculan el corte con `RETENTION_DAYS` —la misma constante
    que leen después—, así que bajarla a 7 o subirla a 365 los dejaría en verde.
    """
    assert RETENTION_DAYS == 90
