"""
routers/stocks.py
─────────────────
NSE stock data endpoints powered by yfinance.

GET /api/v1/stocks/search?q={query}
GET /api/v1/stocks/{ticker}/profile
GET /api/v1/stocks/{ticker}/regime
"""

from __future__ import annotations
import asyncio
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.hmm_regime import analyse_regime, REGIME_META


router = APIRouter(prefix="/api/v1/stocks", tags=["stocks"])


# ── NSE Nifty 50 universe (14 stocks from spec) ────────────────
NSE_UNIVERSE = [
    {"ticker": "TCS.NS",        "name": "Tata Consultancy Services", "sector": "Technology"},
    {"ticker": "INFY.NS",       "name": "Infosys",                   "sector": "Technology"},
    {"ticker": "WIPRO.NS",      "name": "Wipro",                     "sector": "Technology"},
    {"ticker": "HDFCBANK.NS",   "name": "HDFC Bank",                 "sector": "Finance"},
    {"ticker": "ICICIBANK.NS",  "name": "ICICI Bank",                "sector": "Finance"},
    {"ticker": "KOTAKBANK.NS",  "name": "Kotak Mahindra Bank",       "sector": "Finance"},
    {"ticker": "RELIANCE.NS",   "name": "Reliance Industries",       "sector": "Energy"},
    {"ticker": "ONGC.NS",       "name": "Oil & Natural Gas Corp",    "sector": "Energy"},
    {"ticker": "HINDUNILVR.NS", "name": "Hindustan Unilever",        "sector": "Consumer"},
    {"ticker": "ITC.NS",        "name": "ITC Limited",               "sector": "Consumer"},
    {"ticker": "TATAMOTORS.NS", "name": "Tata Motors",               "sector": "Auto"},
    {"ticker": "MARUTI.NS",     "name": "Maruti Suzuki",             "sector": "Auto"},
    {"ticker": "SUNPHARMA.NS",  "name": "Sun Pharmaceutical",        "sector": "Healthcare"},
    {"ticker": "DRREDDY.NS",    "name": "Dr. Reddy's Laboratories",  "sector": "Healthcare"},
]

TICKER_MAP = {s["ticker"]: s for s in NSE_UNIVERSE}


# ── Data fetching helpers ──────────────────────────────────────
def _fetch_history(ticker: str, period: str = "2y") -> pd.DataFrame:
    """Fetch historical OHLCV from yfinance. Raises on failure."""
    try:
        t = yf.Ticker(ticker)
        df = t.history(period=period, auto_adjust=True)
        if df.empty:
            raise HTTPException(404, f"No data returned for {ticker}")
        return df
    except Exception as e:
        raise HTTPException(502, f"yfinance error for {ticker}: {str(e)}")


def _realised_vol(close: pd.Series, window: int = 30) -> float:
    """30-day annualised realised volatility."""
    log_ret = np.log(close / close.shift(1)).dropna()
    rv = log_ret.tail(window).std() * np.sqrt(252)
    return float(rv)


def _fetch_india_vix() -> float:
    """Fetch India VIX from yfinance (^INDIAVIX)."""
    try:
        vix = yf.Ticker("^INDIAVIX")
        hist = vix.history(period="5d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        pass
    return 15.0  # default fallback


def _circuit_limits(price: float) -> dict:
    """NSE 20% circuit breaker limits."""
    return {
        "upper_circuit_inr": round(price * 1.20, 2),
        "lower_circuit_inr": round(price * 0.80, 2),
        "upper_pct": 20.0,
        "lower_pct": -20.0,
    }


# ── Response models ────────────────────────────────────────────
class StockSearchResult(BaseModel):
    ticker: str
    name: str
    sector: str
    price_inr: float
    change_pct: float
    market_cap_cr: Optional[float]
    avg_daily_volume: float


class StockProfile(BaseModel):
    ticker: str
    name: str
    sector: str
    price_inr: float
    change_pct: float
    avg_daily_volume: float
    realised_vol_30d_pct: float
    market_cap_cr: Optional[float]
    circuit_limits: dict
    india_vix: float
    current_regime: int
    regime_meta: dict
    data_delay_note: str


class RegimeResponse(BaseModel):
    ticker: str
    current_regime: int
    regime_probabilities: list[float]
    regime_meta: dict
    regime_history: list[int]
    transition_matrix: list[list[float]]
    feature_importance: dict
    price_history: dict


# ── Endpoints ──────────────────────────────────────────────────
@router.get("/search", response_model=list[StockSearchResult])
async def search_stocks(q: str = Query(..., min_length=1)) -> list[StockSearchResult]:
    """
    Search NSE universe by ticker or name.
    Returns live price + basic stats from yfinance.
    Data is delayed ~15 minutes.
    """
    q_lower = q.lower().replace(".ns", "")
    matches = [
        s for s in NSE_UNIVERSE
        if q_lower in s["ticker"].lower().replace(".ns", "")
        or q_lower in s["name"].lower()
    ]

    if not matches:
        return []

    # Fetch prices for matched tickers in parallel
    tickers = [m["ticker"] for m in matches[:6]]  # cap at 6

    async def fetch_one(ticker: str):
        try:
            loop = asyncio.get_running_loop()
            df = await loop.run_in_executor(
                None, lambda: yf.Ticker(ticker).history(period="5d")
            )
            if df.empty:
                return None
            latest = df.iloc[-1]
            prev   = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
            price  = float(latest["Close"])
            chg    = float((price - prev["Close"]) / prev["Close"] * 100)
            adv    = float(df["Volume"].tail(30).mean())

            info = TICKER_MAP.get(ticker, {})
            return {
                "ticker":       ticker,
                "name":         info.get("name", ticker),
                "sector":       info.get("sector", ""),
                "price_inr":    round(price, 2),
                "change_pct":   round(chg, 2),
                "avg_daily_volume": round(adv),
                "data_delay_note": "Prices delayed ~15 minutes",
            }
        except Exception:
            return None

    results = await asyncio.gather(*[fetch_one(t) for t in tickers])
    return [r for r in results if r is not None]


@router.get("/{ticker}/profile", response_model=StockProfile)
async def get_stock_profile(ticker: str) -> StockProfile:
    """
    Full stock profile: price, volume, volatility, circuit limits, regime.
    """
    ticker = ticker.upper()
    if not ticker.endswith(".NS"):
        ticker += ".NS"

    if ticker not in TICKER_MAP:
        raise HTTPException(404, f"{ticker} not in ARXIS universe")

    info = TICKER_MAP[ticker]

    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, lambda: _fetch_history(ticker, "3mo"))

    latest_price = float(df["Close"].iloc[-1])
    prev_price   = float(df["Close"].iloc[-2]) if len(df) > 1 else latest_price
    change_pct   = (latest_price - prev_price) / prev_price * 100
    adv          = float(df["Volume"].tail(30).mean())
    rv           = _realised_vol(df["Close"])

    # Fetch VIX in parallel
    vix = await loop.run_in_executor(None, _fetch_india_vix)

    # Quick regime (use 3mo data for speed)
    try:
        df_2y = await loop.run_in_executor(None, lambda: _fetch_history(ticker, "2y"))
        from models.hmm_regime import HMMRegimeDetector
        det = HMMRegimeDetector()
        det.fit(df_2y)
        current_regime, _ = det.current_regime_probs(df_2y)
    except Exception:
        current_regime = 1

    return {
        "ticker":                ticker,
        "name":                  info["name"],
        "sector":                info["sector"],
        "price_inr":             round(latest_price, 2),
        "change_pct":            round(change_pct, 2),
        "avg_daily_volume":      round(adv),
        "realised_vol_30d_pct":  round(rv * 100, 2),
        "circuit_limits":        _circuit_limits(latest_price),
        "india_vix":             round(vix, 2),
        "current_regime":        current_regime,
        "regime_meta":           REGIME_META[current_regime],
        "data_delay_note":       "Prices delayed ~15 minutes",
        # ADD THIS LINE RIGHT HERE:
        "market_cap_cr":         None, # or calculate it if you have the data
    }


@router.get("/{ticker}/regime", response_model=RegimeResponse)
async def get_regime(ticker: str) -> RegimeResponse:
    """
    Full HMM regime analysis: history, transition matrix, feature importance.
    """
    ticker = ticker.upper()
    if not ticker.endswith(".NS"):
        ticker += ".NS"

    if ticker not in TICKER_MAP:
        raise HTTPException(404, f"{ticker} not in ARXIS universe")

    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, lambda: _fetch_history(ticker, "2y"))

    try:
        result = await loop.run_in_executor(None, lambda: analyse_regime(df))
    except Exception as e:
        raise HTTPException(500, f"HMM failed: {str(e)}")

    return {
        "ticker":                ticker,
        "current_regime":        result.current_regime,
        "regime_probabilities":  [round(p, 4) for p in result.regime_probabilities],
        "regime_meta":           result.meta,
        "regime_history":        result.regime_history,
        "transition_matrix":     [[round(p, 4) for p in row] for row in result.transition_matrix],
        "feature_importance":    result.feature_importance,
        "price_history": {
            "dates":  result.dates,
            "prices": [round(p, 2) for p in result.prices],
        },
    }
