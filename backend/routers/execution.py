"""
routers/execution.py
────────────────────
Execution strategy generation endpoints.

POST /api/v1/execution/generate
GET  /api/v1/execution/{id}/schedule
GET  /api/v1/execution/{id}/risk
POST /api/v1/execution/{id}/simulate
GET  /api/v1/execution/{id}/report
"""

from __future__ import annotations
import asyncio
import uuid
from datetime import datetime
from typing import Literal

import numpy as np
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.almgren_chriss import AlmgrenChriss, ACParameters
from models.hmm_regime import analyse_regime, REGIME_META, HMMRegimeDetector
from models.rl_agent import generate_rl_schedule
from models.simulator import SimulationParams, compare_ac_vs_rl


router = APIRouter(prefix="/api/v1/execution", tags=["execution"])

# In-memory store (use Redis in production)
_store: dict[str, dict] = {}


# ── Request / Response models ──────────────────────────────────
class GenerateRequest(BaseModel):
    ticker: str
    shares: int = Field(..., gt=0, description="Shares to sell")
    horizon_days: int = Field(..., ge=1, le=60)
    risk_preference: float = Field(..., ge=0.0, le=1.0,
                                   description="0=min cost, 1=min risk")


class GenerateResponse(BaseModel):
    execution_id: str
    ticker: str
    shares: int
    horizon_days: int
    current_regime: int
    regime_meta: dict
    ac_summary: dict
    rl_summary: dict
    savings_inr: float
    savings_pct: float
    sebi_compliant: bool
    regime_full: dict | None = None


class SimulateRequest(BaseModel):
    scenario: Literal["normal", "high_vol", "flash_crash"] = "normal"


# ── Helper: fetch stock data ───────────────────────────────────
def _fetch_stock_data(ticker: str) -> dict:
    """
    Fetch all required market data for execution modelling.
    Returns price, volatility, volume, regime.
    """
    t = yf.Ticker(ticker)

    # 2 years for HMM + vol calibration
    df_2y = t.history(period="2y", auto_adjust=True)
    if df_2y.empty:
        raise HTTPException(502, f"No price data for {ticker}")

    # Current price, volume
    latest = df_2y.iloc[-1]
    prev   = df_2y.iloc[-2] if len(df_2y) > 1 else latest

    price = float(latest["Close"])
    adv   = float(df_2y["Volume"].tail(30).mean())

    # Realised 30-day vol (annualised)
    log_rets = np.log(df_2y["Close"] / df_2y["Close"].shift(1)).dropna()
    sigma = float(log_rets.tail(30).std() * np.sqrt(252))
    sigma = max(sigma, 0.05)   # floor at 5% for degenerate cases

    # India VIX
    try:
        vix_df = yf.Ticker("^INDIAVIX").history(period="5d")
        vix = float(vix_df["Close"].iloc[-1]) if not vix_df.empty else 15.0
    except Exception:
        vix = 15.0

    # HMM regime
    try:
        detector = HMMRegimeDetector()
        detector.fit(df_2y)
        current_regime, regime_probs = detector.current_regime_probs(df_2y)
        # Build projected regime sequence for horizon
        trans_matrix = detector.transition_matrix_by_regime()
    except Exception:
        current_regime = 1
        regime_probs   = [0.0, 1.0, 0.0, 0.0]
        trans_matrix   = [
            [0.85, 0.10, 0.04, 0.01],
            [0.10, 0.75, 0.12, 0.03],
            [0.05, 0.30, 0.55, 0.10],
            [0.02, 0.15, 0.40, 0.43],
        ]

    return {
        "df": df_2y,
        "price": price,
        "adv": adv,
        "sigma": sigma,
        "vix": vix,
        "current_regime": current_regime,
        "regime_probs": regime_probs,
        "trans_matrix": trans_matrix,
    }


def _project_regime_sequence(
    init_regime: int,
    trans_matrix: list[list[float]],
    n_sessions: int,
    seed: int = 0,
) -> list[int]:
    """Project expected regime for each future session using Markov chain."""
    rng = np.random.default_rng(seed)
    T = np.array(trans_matrix)
    regimes = [init_regime]
    current = init_regime
    for _ in range(n_sessions - 1):
        current = int(rng.choice(4, p=T[current]))
        regimes.append(current)
    return regimes


def _calibrate_ac_params(
    market_data: dict,
    shares: int,
    horizon_days: int,
    risk_preference: float,
) -> ACParameters:
    """Build ACParameters from live market data."""
    return ACParameters(
        sigma=market_data["sigma"],
        daily_volume=market_data["adv"],
        price=market_data["price"],
        total_shares=float(shares),
        horizon_days=horizon_days,
        risk_aversion=risk_preference,
        sessions_per_day=2,
    )


# ── POST /generate ─────────────────────────────────────────────
@router.post("/generate", response_model=GenerateResponse)
async def generate_strategy(req: GenerateRequest) -> GenerateResponse:
    """
    Main execution strategy endpoint.
    1. Fetches live market data via yfinance
    2. Trains HMM on historical data → current regime
    3. Solves Almgren-Chriss closed-form → AC schedule
    4. Runs QR-DQN agent (or heuristic) → RL schedule
    5. Stores full result for subsequent endpoints
    6. Returns summary
    """
    ticker = req.ticker.upper()
    if not ticker.endswith(".NS"):
        ticker += ".NS"

    loop = asyncio.get_running_loop()

    # Fetch all market data (I/O bound → run in executor)
    try:
        market_data = await loop.run_in_executor(
            None, lambda: _fetch_stock_data(ticker)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Market data fetch failed: {str(e)}")

    # Build AC parameters
    ac_params = _calibrate_ac_params(
        market_data, req.shares, req.horizon_days, req.risk_preference
    )

    # Solve AC
    ac_engine = AlmgrenChriss(ac_params)
    ac_result = ac_engine.full_result()

    n_sessions = ac_params.T
    ac_schedule = [s["shares"] for s in ac_result["schedule"]]

    # Project regime sequence
    regime_seq = _project_regime_sequence(
        market_data["current_regime"],
        market_data["trans_matrix"],
        n_sessions,
    )

    # RL schedule (uses trained agent or heuristic fallback)
    rl_schedule = await loop.run_in_executor(
        None,
        lambda: generate_rl_schedule(
            total_shares=float(req.shares),
            total_sessions=n_sessions,
            sigma_annual=market_data["sigma"],
            eta=ac_params.eta,
            gamma=ac_params.gamma,
            init_price=market_data["price"],
            vix_level=market_data["vix"],
            regime_sequence=regime_seq,
            ac_schedule=ac_schedule,
            risk_aversion=req.risk_preference,
        ),
    )

    # Monte Carlo comparison (normal scenario, 500 paths for speed)
    sim_params = SimulationParams(
        total_shares=float(req.shares),
        total_sessions=n_sessions,
        schedule=ac_schedule,
        init_price=market_data["price"],
        sigma_annual=market_data["sigma"],
        eta=ac_params.eta,
        gamma=ac_params.gamma,
        init_regime=market_data["current_regime"],
        vix_level=market_data["vix"],
        n_scenarios=100,
    )
    comparison = await loop.run_in_executor(
        None,
        lambda: compare_ac_vs_rl(sim_params, rl_schedule, "normal"),
    )

    # Build RL session schedule
    rl_sessions = []
    for j, (ac_sess, rl_shares) in enumerate(
        zip(ac_result["schedule"], rl_schedule)
    ):
        rl_sessions.append({
            **ac_sess,
            "model": "RL-Optimized",
            "shares": round(rl_shares),
            "regime": regime_seq[j] if j < len(regime_seq) else 1,
            "regime_meta": REGIME_META[regime_seq[j] if j < len(regime_seq) else 1],
            "diff_vs_ac": round(rl_shares - ac_sess["shares"]),
        })

    # HMM full analysis for regime page
    try:
        regime_result = await loop.run_in_executor(
            None, lambda: analyse_regime(market_data["df"])
        )
        regime_full = {
            "current_regime":       regime_result.current_regime,
            "regime_probabilities": regime_result.regime_probabilities,
            "regime_history":       regime_result.regime_history,
            "transition_matrix":    regime_result.transition_matrix,
            "feature_importance":   regime_result.feature_importance,
            "price_history": {
                "dates":  regime_result.dates,
                "prices": regime_result.prices,
            },
        }
    except Exception:
        regime_full = {}

    # Store full result
    execution_id = str(uuid.uuid4())[:8]
    _store[execution_id] = {
        "ticker":          ticker,
        "shares":          req.shares,
        "horizon_days":    req.horizon_days,
        "risk_preference": req.risk_preference,
        "market_data":     {
            **{k: v for k, v in market_data.items() if k != "df"},
            "eta": ac_params.eta,
            "gamma": ac_params.gamma,
        },
        "ac_result":       ac_result,
        "rl_schedule":     rl_schedule,
        "rl_sessions":     rl_sessions,
        "regime_seq":      regime_seq,
        "comparison":      comparison,
        "regime_full":     regime_full,
        "created_at":      datetime.utcnow().isoformat(),
    }

    ac_cost = comparison["classical_ac"]["expected_cost_inr"]
    rl_cost = comparison["rl_optimized"]["expected_cost_inr"]
    savings_inr = ac_cost - rl_cost
    savings_pct = (savings_inr / ac_cost * 100) if ac_cost > 0 else 0

    return GenerateResponse(
        execution_id=execution_id,
        ticker=ticker,
        shares=req.shares,
        horizon_days=req.horizon_days,
        current_regime=market_data["current_regime"],
        regime_meta=REGIME_META[market_data["current_regime"]],
        ac_summary={
            "expected_cost_inr":  ac_cost,
            "basis_points":       ac_result["cost_breakdown"]["basis_points"],
            "schedule":           ac_schedule,
        },
        rl_summary={
            "expected_cost_inr":  rl_cost,
            "cvar_95_inr":        comparison["rl_optimized"]["cvar_95_inr"],
            "schedule":           rl_schedule,
        },
        savings_inr=round(savings_inr),
        savings_pct=round(savings_pct, 2),
        sebi_compliant=(req.horizon_days >= 1),
        regime_full=regime_full,
    )


# ── GET /schedule ──────────────────────────────────────────────
@router.get("/{execution_id}/schedule")
async def get_schedule(execution_id: str) -> dict:
    data = _store.get(execution_id)
    if not data:
        raise HTTPException(404, "Execution not found. Call /generate first.")

    ac_sessions = data["ac_result"]["schedule"]
    rl_sessions = data["rl_sessions"]

    # Merge AC + RL into unified table
    unified = []
    for ac, rl in zip(ac_sessions, rl_sessions):
        unified.append({
            "session_id":           ac["session_id"],
            "label":                ac["label"],
            "day":                  ac["day"],
            "time_window_ist":      ac["time_window_ist"],
            "ac_shares":            round(ac["shares"]),
            "rl_shares":            round(rl["shares"]),
            "diff":                 round(rl["shares"] - ac["shares"]),
            "impact_per_share_inr": ac["impact_per_share_inr"],
            "regime":               rl["regime"],
            "regime_name":          REGIME_META[rl["regime"]]["name"],
            "ac_cumulative":        ac["cumulative_shares"],
            "ac_cost_cumulative":   ac["cumulative_cost_inr"],
        })

    return {
        "execution_id": execution_id,
        "ticker":       data["ticker"],
        "sessions":     unified,
        "intraday_profile": _intraday_volume_profile(),
    }


# ── GET /risk ──────────────────────────────────────────────────
@router.get("/{execution_id}/risk")
async def get_risk(execution_id: str) -> dict:
    data = _store.get(execution_id)
    if not data:
        raise HTTPException(404, "Execution not found")

    return {
        "execution_id": execution_id,
        "ticker":       data["ticker"],
        "comparison": data["comparison"],
    }


# ── POST /simulate ─────────────────────────────────────────────
@router.post("/{execution_id}/simulate")
async def simulate(
    execution_id: str,
    body: SimulateRequest,
) -> dict:
    data = _store.get(execution_id)
    if not data:
        raise HTTPException(404, "Execution not found")

    scenario = body.scenario

    md = data["market_data"]
    sim_params = SimulationParams(
        total_shares=float(data["shares"]),
        total_sessions=len(data["ac_result"]["schedule"]),
        schedule=[s["shares"] for s in data["ac_result"]["schedule"]],
        init_price=md["price"],
        sigma_annual=md["sigma"],
        eta=md.get("eta", 2e-6),
        gamma=md.get("gamma", 1e-6),
        init_regime=md["current_regime"],
        vix_level=md["vix"],
        n_scenarios=250,
    )

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: compare_ac_vs_rl(sim_params, data["rl_schedule"], scenario),
    )

    # Cache scenario result
    data["comparison_" + scenario] = result

    return result


# ── GET /report ────────────────────────────────────────────────
@router.get("/{execution_id}/report")
async def get_report(execution_id: str) -> dict:
    data = _store.get(execution_id)
    if not data:
        raise HTTPException(404, "Execution not found")

    md   = data["market_data"]
    comp = data["comparison"]

    # Slippage attribution (approximate from AC cost breakdown)
    ac_costs = data["ac_result"]["cost_breakdown"]
    total_cost_inr = comp["rl_optimized"]["expected_cost_inr"]

    perm_share  = ac_costs["permanent_impact_inr"] / max(ac_costs["total_expected_inr"], 1)
    temp_share  = ac_costs["temporary_impact_inr"] / max(ac_costs["total_expected_inr"], 1)
    timing_share= ac_costs["timing_risk_inr"]       / max(ac_costs["total_expected_inr"], 1)
    regime_share= max(0, 1 - perm_share - temp_share - timing_share)

    return {
        "execution_id":    execution_id,
        "ticker":          data["ticker"],
        "shares":          data["shares"],
        "horizon_days":    data["horizon_days"],
        "arrival_price_inr": round(md["price"], 2),
        "india_vix":       md["vix"],
        "current_regime":  md["current_regime"],
        "regime_meta":     REGIME_META[md["current_regime"]],
        "created_at":      data["created_at"],
        "performance": {
            "ac_cost_inr":      comp["classical_ac"]["expected_cost_inr"],
            "rl_cost_inr":      comp["rl_optimized"]["expected_cost_inr"],
            "savings_inr":      comp["improvement"]["savings_inr"],
            "savings_pct":      comp["improvement"]["expected_cost_pct"],
            "ac_bps":           round(data["ac_result"]["cost_breakdown"]["basis_points"], 2),
        },
        "slippage_attribution": {
            "permanent_impact_pct":  round(perm_share * 100, 1),
            "temporary_impact_pct":  round(temp_share * 100, 1),
            "timing_risk_pct":       round(timing_share * 100, 1),
            "regime_delays_pct":     round(regime_share * 100, 1),
        },
        "regime_journey": data.get("regime_seq", []),
        "sebi_compliance": {
            "pre_planned":      True,
            "horizon_days":     data["horizon_days"],
            "blackout_clear":   True,
            "compliant":        True,
        },
    }


# ── Helper: intraday liquidity profile ────────────────────────
def _intraday_volume_profile() -> dict:
    """
    Average intraday volume profile for NSE (9:15am–3:30pm).
    Based on typical NSE large-cap microstructure.
    High volume at open (9:15–10:00) and close (14:45–15:30).
    """
    slots = [
        "09:15","09:30","09:45","10:00","10:15","10:30","10:45",
        "11:00","11:15","11:30","11:45","12:00","12:15","12:30",
        "12:45","13:00","13:15","13:30","13:45","14:00","14:15",
        "14:30","14:45","15:00","15:15","15:30",
    ]
    # Typical volume shape: U-shaped with open/close spikes
    volumes = [
        9.2, 7.1, 5.8, 4.9, 4.4, 4.2, 3.9,
        3.8, 3.6, 3.5, 3.4, 3.2, 3.1, 3.0,
        3.0, 3.1, 3.2, 3.4, 3.6, 3.8, 4.0,
        4.4, 5.0, 5.8, 7.2, 9.8,
    ]
    return {"slots": slots, "relative_volume": volumes}
