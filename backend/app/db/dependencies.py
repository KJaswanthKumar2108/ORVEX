from collections.abc import Generator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session


def get_db_session(request: Request) -> Generator[Session, None, None]:
    session_factory = getattr(request.app.state, "session_factory", None)
    if session_factory is None:
        raise HTTPException(status_code=503, detail="Database is not configured.")

    with session_factory() as session:
        yield session