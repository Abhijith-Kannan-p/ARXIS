"""
main.py
───────
ARXIS FastAPI backend.

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Deploy on Railway:
    Railway auto-detects Procfile and runs:
    uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Optional but highly recommended for local dev:
# pip install python-dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from routers.stocks import router as stocks_router
from routers.execution import router as execution_router

# ── Logging Configuration ──────────────────────────────────────
# This ensures your global exception handler actually prints to the console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ── App Initialization ─────────────────────────────────────────
app = FastAPI(
    title="ARXIS",
    description=(
        "Adaptive Regime-aware eXecution Intelligence System. "
        "Institutional execution analytics for NSE equities."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ───────────────────────────────────────────────────────
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000", # Added 127.0.0.1 just in case Next.js uses it
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://.*\.railway\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────
# Pro-tip: If your routers don't have prefixes defined inside them, 
# you can add them here like this: prefix="/api/stocks"
app.include_router(stocks_router)
app.include_router(execution_router)


# ── Health checks ──────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "ARXIS Backend"}


@app.get("/api/health", tags=["Health"])
async def health_api():
    return {"status": "ok", "service": "ARXIS Backend"}


@app.get("/", tags=["Core"])
async def root():
    return {
        "service": "ARXIS",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }


# ── Global error handler ───────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Now this will properly log the traceback in your terminal!
    logger.exception(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check backend logs."},
    )