from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

router = APIRouter()


@router.get("/health")
def health(request: Request, details: bool = Query(default=False)) -> dict[str, Any]:
    if not details:
        return {"status": "ok"}

    response: dict[str, Any] = {"status": "ok"}
    gateway = getattr(request.app.state, "mqtt_gateway", None)
    if gateway is not None and hasattr(gateway, "get_status"):
        response["mqtt_gateway"] = gateway.get_status()

    return response
