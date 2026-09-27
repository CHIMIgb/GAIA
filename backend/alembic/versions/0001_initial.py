"""esquema inicial: session_events + data_ingestion_log

Columnas literales de docs/GAIA_DATABASE.md §3.1 y veredicto §8.4.
El ROADMAP 0.3.1 nombra `session` y `api_log`; el modelo canónico fija estos dos
nombres (y las columnas de la sesión: solo hash, sin cookie cruda ni IP).

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        # sha256 en hex (64). Nunca la cookie cruda: DATABASE §8.3.
        sa.Column("session_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "first_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("request_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("user_agent_family", sa.Text(), nullable=True),
        # Sin columna IP: solo el país agregado (DATABASE §8.3).
        sa.Column("country_code", sa.String(length=8), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_hash", name="uq_session_events_session_hash"),
    )
    op.create_table(
        "data_ingestion_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("module", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("rows", sa.Integer(), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('ok', 'fallback', 'error')",
            name="ck_data_ingestion_log_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("data_ingestion_log")
    op.drop_table("session_events")
