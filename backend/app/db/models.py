"""Tablas base de la Fase 0, tal cual las define docs/GAIA_DATABASE.md.

Solo infraestructura: `data_ingestion_log` (auditoría de la ingesta, §3.1),
`session_events` (§3.1 y veredicto §8.4: solo el hash sha256 de la cookie, nunca
el valor crudo ni la IP) y `api_log` (ROADMAP 0.3.3, mismo criterio de privacidad).
Las tablas de dominio (fire_hotspot, earthquake, wind_frame, radiation_reading,
elevation_sample) llegan con su módulo en F2-F6.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Float,
    Identity,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Las 2 tablas base (ROADMAP 0.3.1) resueltas contra el modelo canónico:
# el ROADMAP las llama `session` y `api_log`; DATABASE §3.1/§8.4 fija
# `session_events` y `data_ingestion_log` (nombres y columnas explícitos).
# `api_log` (ROADMAP 0.3.3) sí es el nombre del ROADMAP: no existe en §3.1, se
# creo por decision propia y se anadio al modelo canonico con ese acuerdo.


class SessionEvent(Base):
    """Registro de eventos de sesión anonimizados (DATABASE §8.4)."""

    __tablename__ = "session_events"
    __table_args__ = (
        UniqueConstraint("session_hash", name="uq_session_events_session_hash"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # sha256 en hex: 64 caracteres. Nunca la cookie cruda (DATABASE §8.3).
    session_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    request_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    user_agent_family: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sin IP: solo el país agregado (DATABASE §8.3).
    country_code: Mapped[str | None] = mapped_column(String(8), nullable=True)


class DataIngestionLog(Base):
    """Auditoría de la ingesta (DATABASE §3.1)."""

    __tablename__ = "data_ingestion_log"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ok', 'fallback', 'error')", name="ck_data_ingestion_log_status"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    module: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    rows: Mapped[int] = mapped_column(Integer, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ApiLog(Base):
    """Registro de peticiones a la API (ROADMAP 0.3.3).

    Sin columna de IP y con el hash de sesión en lugar de la cookie: la misma
    regla de privacidad que `session_events` (DATABASE §8.3, SECURITY §4).
    """

    __tablename__ = "api_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    method: Mapped[str] = mapped_column(String(8), nullable=False)
    path: Mapped[str] = mapped_column(String(256), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    # sha256 en hex de la cookie; NULL si la petición no traía sesión.
    session_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
