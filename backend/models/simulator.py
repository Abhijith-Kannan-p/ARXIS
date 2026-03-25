"""
simulator.py
────────────
Monte Carlo simulator for execution cost distributions.

Generates N scenarios of price paths and computes:
  - Distribution of total execution cost (INR)
  - Expected cost, median, CVaR at 95%, worst case
  - Probability of exceeding budget

Scenarios vary:
  - Price path (GBM with regime-switching drift/vol)
  - Intraday volume (log-normal variation around ADV)
  - Regime transitions (Markov chain)
  - Flash-crash events (optional)
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import Literal


ScenarioType = Literal["normal", "high_vol", "flash_crash"]


@dataclass
class SimulationParams:
    total_shares: float
    total_sessions: int
    schedule: list[float]       # shares per session (AC or RL)
    init_price: float
    sigma_annual: float
    eta: float
    gamma: float
    init_regime: int
    vix_level: float
    n_scenarios: int = 250
    seed: int = 42


@dataclass
class SimulationResult:
    costs_inr: list[float]          # all N scenario costs
    expected_cost_inr: float
    median_cost_inr: float
    cvar_95_inr: float
    worst_case_inr: float
    prob_exceed_budget: float
    budget_inr: float               # 1.5× expected cost
    percentiles: dict               # {5, 25, 50, 75, 95}
    histogram: dict                 # {bins, counts} for frontend


def simulate_execution_costs(
    params: SimulationParams,
    scenario: ScenarioType = "normal",
) -> SimulationResult:
    """
    Run Monte Carlo simulation of true execution costs (Implementation Shortfall).
    """
    rng = np.random.default_rng(params.seed)
    n = params.n_scenarios
    T = params.total_sessions
    schedule = np.array(params.schedule[:T], dtype=float)
    if len(schedule) < T:
        schedule = np.concatenate([schedule, np.zeros(T - len(schedule))])

    sigma_session = params.sigma_annual / np.sqrt(252 * 2)

    # Scenario-specific parameters
    if scenario == "normal":
        vol_scale    = 1.0
        crash_prob   = 0.0
        drift_bias   = 0.0
    elif scenario == "high_vol":
        vol_scale    = 2.2   # VIX > 25
        crash_prob   = 0.0
        drift_bias   = -0.001
    elif scenario == "flash_crash":
        vol_scale    = 1.5
        crash_prob   = 0.08  # 8% chance of crash on any session
        drift_bias   = -0.002
    else:
        vol_scale = 1.0; crash_prob = 0.0; drift_bias = 0.0

    # Transition matrix (simplified 4-state Markov)
    TRANS = np.array([
        [0.85, 0.10, 0.04, 0.01],
        [0.10, 0.75, 0.12, 0.03],
        [0.05, 0.30, 0.55, 0.10],
        [0.02, 0.15, 0.40, 0.43],
    ])
    DRIFT_BY_REGIME  = np.array([0.5, 0.0, -0.8, -2.0]) * sigma_session
    VOL_BY_REGIME    = np.array([0.8, 1.0, 1.4, 2.0]) * sigma_session * vol_scale

    all_costs = np.zeros(n)

    for i in range(n):
        price   = params.init_price
        regime  = params.init_regime
        dollars_received = 0.0

        for j in range(T):
            n_j = schedule[j]
            if n_j <= 0:
                continue

            # Flash crash
            if crash_prob > 0 and rng.random() < crash_prob / T:
                price *= (1 - 0.08 * (0.5 + rng.random() * 0.5))

            # Temporary impact cost base
            tau = 0.5
            base_impact_frac = params.eta * n_j / tau

            # Volume noise — log-normal intraday volume deviation
            vol_noise = rng.lognormal(0, 0.25)
            impact_scale = 1.0 / max(vol_noise, 0.1)
            
            # Apply volume noise to temporary impact
            temp_impact_frac = base_impact_frac * min(impact_scale, 3.0)
            
            # Permanent impact fraction on THIS specific trade
            perm_impact_frac = params.gamma * n_j * 0.5

            # Calculate actual execution price including all slippage
            total_impact_frac = temp_impact_frac + perm_impact_frac
            exec_price = price * (1 - total_impact_frac)

            # Record the actual cash received for this session
            dollars_received += (exec_price * n_j)

            # Price evolution for the NEXT session
            drift = DRIFT_BY_REGIME[regime] + drift_bias
            vol   = VOL_BY_REGIME[regime]
            log_ret = drift + rng.normal(0, vol)
            
            price *= np.exp(log_ret)
            
            # Permanent impact depresses the asset price permanently going forward
            price *= (1 - params.gamma * n_j)
            price = max(price, 1.0)

            # Regime transition
            regime = int(rng.choice(4, p=TRANS[regime]))

        # Implementation Shortfall: What you WOULD have made instantly minus what you ACTUALLY made
        ideal_revenue = params.init_price * params.total_shares
        all_costs[i] = ideal_revenue - dollars_received

    # ── Statistics ──────────────────────────────────────────────
    expected = float(np.mean(all_costs))
    median   = float(np.median(all_costs))
    var_95   = float(np.quantile(all_costs, 0.95))
    tail     = all_costs[all_costs >= var_95]
    cvar_95  = float(tail.mean()) if len(tail) > 0 else var_95
    worst    = float(np.max(all_costs))

    # Budget = 1.5× expected cost (reasonable institutional budget)
    budget   = expected * 1.5
    prob_exceed = float(np.mean(all_costs > budget))

    # Percentiles
    pcts = {
        5:  float(np.percentile(all_costs, 5)),
        25: float(np.percentile(all_costs, 25)),
        50: float(np.percentile(all_costs, 50)),
        75: float(np.percentile(all_costs, 75)),
        95: float(np.percentile(all_costs, 95)),
    }

    # Histogram for frontend (30 bins)
    counts, bin_edges = np.histogram(all_costs, bins=30)
    histogram = {
        "bins":   [round(float(b)) for b in bin_edges[:-1]],
        "counts": counts.tolist(),
        "bin_width": float(bin_edges[1] - bin_edges[0]),
    }

    return SimulationResult(
        costs_inr=all_costs.tolist(),
        expected_cost_inr=expected,
        median_cost_inr=median,
        cvar_95_inr=cvar_95,
        worst_case_inr=worst,
        prob_exceed_budget=prob_exceed,
        budget_inr=budget,
        percentiles=pcts,
        histogram=histogram,
    )


def compare_ac_vs_rl(
    ac_params: SimulationParams,
    rl_schedule: list[float],
    scenario: ScenarioType = "normal",
) -> dict:
    """
    Run both AC and RL schedules through the same Monte Carlo paths
    and return comparison statistics.
    """
    # Run AC
    ac_result = simulate_execution_costs(ac_params, scenario)

    # Run RL (same seed → same price paths → fair comparison)
    rl_params = SimulationParams(
        total_shares=ac_params.total_shares,
        total_sessions=ac_params.total_sessions,
        schedule=rl_schedule,
        init_price=ac_params.init_price,
        sigma_annual=ac_params.sigma_annual,
        eta=ac_params.eta,
        gamma=ac_params.gamma,
        init_regime=ac_params.init_regime,
        vix_level=ac_params.vix_level,
        n_scenarios=ac_params.n_scenarios,
        seed=ac_params.seed,   # same seed = same paths
    )
    rl_result = simulate_execution_costs(rl_params, scenario)

    def pct_improvement(ac_val, rl_val):
        if ac_val == 0:
            return 0.0
        return round((ac_val - rl_val) / ac_val * 100, 2)

    return {
        "scenario": scenario,
        "classical_ac": {
            "expected_cost_inr":  round(ac_result.expected_cost_inr),
            "median_cost_inr":    round(ac_result.median_cost_inr),
            "cvar_95_inr":        round(ac_result.cvar_95_inr),
            "worst_case_inr":     round(ac_result.worst_case_inr),
            "prob_exceed_budget": round(ac_result.prob_exceed_budget * 100, 1),
            "histogram":          ac_result.histogram,
        },
        "rl_optimized": {
            "expected_cost_inr":  round(rl_result.expected_cost_inr),
            "median_cost_inr":    round(rl_result.median_cost_inr),
            "cvar_95_inr":        round(rl_result.cvar_95_inr),
            "worst_case_inr":     round(rl_result.worst_case_inr),
            "prob_exceed_budget": round(rl_result.prob_exceed_budget * 100, 1),
            "histogram":          rl_result.histogram,
        },
        "improvement": {
            "expected_cost_pct":  pct_improvement(ac_result.expected_cost_inr, rl_result.expected_cost_inr),
            "median_cost_pct":    pct_improvement(ac_result.median_cost_inr, rl_result.median_cost_inr),
            "cvar_95_pct":        pct_improvement(ac_result.cvar_95_inr, rl_result.cvar_95_inr),
            "worst_case_pct":     pct_improvement(ac_result.worst_case_inr, rl_result.worst_case_inr),
            "savings_inr":        round(ac_result.expected_cost_inr - rl_result.expected_cost_inr),
        },
    }