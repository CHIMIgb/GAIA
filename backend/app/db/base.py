"""Base declarativa del ORM (SQLAlchemy 2).

Esquema según docs/GAIA_DATABASE.md §3 (modelo de datos) y §6.1 (Alembic).
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
