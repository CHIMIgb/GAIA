"""api_log: registro de peticiones a la API + índice para la purga por antigüedad

ROADMAP 0.3.3 ("Registrar peticiones en `api_log` y configurar TTL/limpieza,
retención 90 días"). El nombre de la tabla sí es el del ROADMAP; las columnas
las fija la decisión de privacidad ya tomada en DATABASE §8.3/§8.4 y
SECURITY (se omite la cookie cruda y la IP; se guarda el hash de sesión).

No lleva columna de IP a propósito: es la misma regla que `session_events`.

Revision ID: 0002_api_log
Revises: 0001_initial
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_api_log"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Retención del log de peticiones (ROADMAP 0.3.3). DATABASE §8.3 admite 30-90
# días; el ROADMAP fija 90. La purga la hace `app.db.api_log_store.purge_api_log`
# (un DELETE), no una retention policy de TimescaleDB: la extensión no está
# instalada y una tabla plana no necesita hipertabla.
RETENTION_DAYS = 90


def upgrade() -> None:
    op.create_table(
        "api_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column(
            "logged_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("method", sa.String(length=8), nullable=False),
        # Solo la ruta, sin query string: los parámetros no son datos personales
        # pero tampoco hacen falta para auditar (el criterio es "quién y qué", y
        # "quién" es el hash de sesión).
        sa.Column("path", sa.String(length=256), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        # sha256 en hex de la cookie de sesión; NULL si la petición no llevaba
        # una. Nunca el valor crudo (DATABASE §8.3, SECURITY §4).
        sa.Column("session_hash", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    # La purga filtra por antigüedad y las consultas de auditoría van de más
    # reciente a más antigua; el índice evita un seq scan en ambas.
    op.create_index("ix_api_log_logged_at", "api_log", ["logged_at"])


def downgrade() -> None:
    op.drop_index("ix_api_log_logged_at", table_name="api_log")
    op.drop_table("api_log")
