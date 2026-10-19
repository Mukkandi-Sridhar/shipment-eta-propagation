"""FastAPI service: live what-if re-forecasting + serves the built dashboard.

    uvicorn api.main:app --port 8000
"""

from __future__ import annotations

import pickle
import warnings
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from eta.explain import explain
from eta.simulate import simulate

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
with open(ROOT / "artifacts" / "models.pkl", "rb") as f:
    BUNDLE = pickle.load(f)
CHAIN, ENV = BUNDLE["chain"], BUNDLE["env"]
DF, _ = simulate(n=BUNDLE["n"], seed=BUNDLE["seed"])
ROWS = {r.shipment_id: r for _, r in DF.iterrows()}

app = FastAPI(title="Aiqon ETA & delay-propagation API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Overrides(BaseModel):
    cong_dest_now: float | None = Field(None, ge=0.4, le=0.97)
    cong_origin_now: float | None = Field(None, ge=0.4, le=0.97)
    weather_now: float | None = Field(None, ge=0, le=1)
    docs_complete: bool | None = None
    new_importer: bool | None = None
    carrier_reliability: float | None = Field(None, ge=0.3, le=0.9)


class WhatIf(BaseModel):
    shipment_id: str
    checkpoint: int = Field(0, ge=0, le=4)
    extra_lateness_h: float = Field(0, ge=-48, le=336)
    overrides: Overrides = Overrides()


@app.get("/api/health")
def health():
    return {"ok": True, "shipments": len(ROWS)}


@app.post("/api/whatif")
def whatif(req: WhatIf):
    row = ROWS.get(req.shipment_id)
    if row is None:
        raise HTTPException(404, "unknown shipment")
    ov = {k: float(v) for k, v in req.overrides.model_dump().items() if v is not None}
    return explain(CHAIN, row, req.checkpoint, ENV, n_samples=400, overrides=ov or None,
                   extra_lateness=req.extra_lateness_h)


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
