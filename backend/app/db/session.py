import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker


def create_database_engine(database_url: str | None = None) -> Engine:
    configured_url = database_url or os.environ.get("DATABASE_URL")
    if not configured_url:
        raise RuntimeError("DATABASE_URL must be set before creating the database engine")

    url = make_url(configured_url)
    if url.drivername != "postgresql+psycopg":
        raise ValueError("DATABASE_URL must use the PostgreSQL Psycopg 3 driver (postgresql+psycopg)")

    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"options": "-c timezone=UTC"},
    )


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)