"""FastAPI application: JSON API under /api, plus the built React app when present."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import service

app = FastAPI(
    title="WindDesk API",
    description="Day-ahead wind forecast visibility and accuracy for GB power procurement.",
    version="1.0.0",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

AuctionQ = Query(None, description="Auction id from /api/meta (default: EPEX hourly, 09:20)")
GateQ = Query(None, pattern=r"^\d{1,2}:\d{2}$", description="Custom gate closure HH:MM UK time on D-1")


def _gate(auction: str | None, gate: str | None):
    try:
        return service.resolve_gate(auction, gate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    return service.meta()


@app.get("/api/day/{day}")
def day(day: date, auction: str | None = AuctionQ, gate: str | None = GateQ) -> dict:
    auc, gate_time = _gate(auction, gate)
    try:
        return service.day_view(day, gate_time, auc)
    except service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/accuracy")
def accuracy(auction: str | None = AuctionQ, gate: str | None = GateQ) -> dict:
    _, gate_time = _gate(auction, gate)
    return service.accuracy(gate_time)


# Serve the production React build from the same origin (Docker image). On Vercel the
# static files are served by the platform instead, so this directory is absent.
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = STATIC_DIR / path
        return FileResponse(file if path and file.is_file() else STATIC_DIR / "index.html")
