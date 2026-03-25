"""
almgren_chriss.py
─────────────────
Implements the Almgren-Chriss (2001) optimal execution model.

Model:
  Sell X shares over T trading periods.
  Execution cost = Permanent Impact + Temporary Impact + Timing Risk

  Permanent impact:  γ * n_j          (price moves permanently)
  Temporary impact:  η * (n_j / τ)    (intraday reversion)
  Timing risk:       λ * σ² * Σ x_j²  (variance of execution shortfall)

  Optimal trajectory (closed-form):
      x_j = X * sinh(κ(T - j)τ) / sinh(κTτ)
      κ    = sqrt(λ / η̃)   where η̃ = η - γτ/2

References:
  Almgren, R. & Chriss, N. (2001). Optimal execution of portfolio transactions.
  Journal of Risk, 3(2), 5–39.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import List


@dataclass
class ACParameters:
    """Market and execution parameters for Almgren-Chriss model."""
    sigma: float          # Annual volatility (e.g. 0.25 = 25%)
    daily_volume: float   # Average daily volume (shares)
    price: float          # Current price (INR)
    total_shares: float   # Shares to sell (X)
    horizon_days: int     # Trading days (T)
    risk_aversion: float  # Lambda: 0 = min cost, 1 = min risk  (mapped from slider 0-1)
    sessions_per_day: int = 2  # Morning + afternoon

    @property
    def T(self) -> int:
        """Total number of trading sessions."""
        return self.horizon_days * self.sessions_per_day

    @property
    def tau(self) -> float:
        """Duration of one session in trading days."""
        return 1.0 / self.sessions_per_day

    @property
    def sigma_session(self) -> float:
        """Volatility per session (annualised → per session)."""
        trading_days_per_year = 252
        return self.sigma / np.sqrt(trading_days_per_year / self.tau)

    @property
    def eta(self) -> float:
        """
        Temporary impact coefficient (η).
        Calibrated from NSE market microstructure:
          η = price * σ / (daily_volume * sqrt(252))
        Represents cost of trading 1 share instantly.
        """
        return self.sigma / (self.daily_volume * np.sqrt(252))

    @property
    def gamma(self) -> float:
        """
        Permanent impact coefficient (γ).
        Approximately η/2 for liquid NSE large-caps.
        """
        return self.eta * 0.5

    @property
    def lambda_risk(self) -> float:
        """
        Risk aversion coefficient mapped from slider [0, 1].
        Low  = 0.0 → very aggressive (min cost)
        High = 1.0 → very conservative (min risk)
        """
        # Map to economically meaningful range [1e-7, 1e-4]
        return 1e-7 * (1000 ** self.risk_aversion)


class AlmgrenChriss:
    """Optimal execution engine using Almgren-Chriss (2001)."""

    def __init__(self, params: ACParameters):
        self.p = params

    def _kappa(self) -> float:
        """
        Decay coefficient κ = sqrt(λ / η̃)
        where η̃ = η - γ·τ/2  (effective temporary impact adjusted for permanent).
        """
        p = self.p
        eta_tilde = p.eta - p.gamma * p.tau / 2.0
        # Guard against non-positive eta_tilde
        eta_tilde = max(eta_tilde, 1e-10)
        kappa_sq = p.lambda_risk * p.sigma_session**2 / eta_tilde
        return np.sqrt(max(kappa_sq, 1e-20))

    def optimal_trajectory(self) -> np.ndarray:
        """
        Returns x[j] = shares REMAINING at start of session j.
        x[0] = X, x[T] = 0.
        Shape: (T+1,)
        """
        p = self.p
        kappa = self._kappa()
        T = p.T
        tau = p.tau
        X = p.total_shares

        j = np.arange(T + 1)
        # Avoid sinh overflow for large kappa*T
        arg = kappa * tau * (T - j)
        denom_arg = kappa * tau * T

        # Use numerically stable computation
        if denom_arg > 300:
            # For very large values, trajectory → linear
            traj = X * (T - j) / T
        else:
            sinh_num = np.sinh(arg)
            sinh_den = np.sinh(denom_arg)
            traj = X * sinh_num / sinh_den

        # Clip to [0, X] and ensure monotone decreasing
        traj = np.clip(traj, 0, X)
        return traj

    def trade_schedule(self) -> np.ndarray:
        """
        Returns n[j] = shares to SELL in session j.
        n[j] = x[j] - x[j+1]
        Shape: (T,)
        """
        traj = self.optimal_trajectory()
        trades = np.diff(-traj)  # positive = shares sold
        trades = np.maximum(trades, 0)
        # Renormalize to exactly sum to total_shares
        if trades.sum() > 0:
            trades = trades * (self.p.total_shares / trades.sum())
        return trades

    def expected_cost(self, trades: np.ndarray | None = None) -> dict:
        """
        Compute expected execution cost broken down by component.

        Returns dict with:
          permanent_impact  (INR)
          temporary_impact  (INR)
          timing_risk       (INR, 1-std equivalent)
          total_expected    (INR)
          total_variance    (INR²)
          basis_points      (bps)
        """
        p = self.p
        if trades is None:
            trades = self.trade_schedule()

        traj = self.optimal_trajectory()
        x = traj[:-1]  # inventory at start of each session

        # Permanent impact cost
        perm = p.gamma * np.sum(trades * trades) / 2.0

        # Temporary impact cost
        temp = p.eta * np.sum((trades / p.tau) * trades)

        # Timing risk (variance of shortfall)
        variance = (p.sigma_session ** 2) * np.sum(x ** 2)

        # Expected total cost (including risk penalty)
        expected = perm + temp + p.lambda_risk * variance

        # Convert variance to 1-sigma cost equivalent
        timing_risk_1sigma = np.sqrt(variance) * p.price

        total_inr = (perm + temp) * p.price + timing_risk_1sigma * 0.5
        notional = p.total_shares * p.price
        bps = (total_inr / notional) * 10000 if notional > 0 else 0

        return {
            "permanent_impact_inr": float(perm * p.price),
            "temporary_impact_inr": float(temp * p.price),
            "timing_risk_inr": float(timing_risk_1sigma),
            "total_expected_inr": float(total_inr),
            "total_variance": float(variance),
            "basis_points": float(bps),
        }

    def full_result(self) -> dict:
        """Complete AC solution ready for API response."""
        p = self.p
        trades = self.trade_schedule()
        costs = self.expected_cost(trades)

        sessions = []
        cumulative_shares = 0
        cumulative_cost = 0.0

        for j, n in enumerate(trades):
            day = j // p.sessions_per_day + 1
            session_num = j % p.sessions_per_day
            session_label = "Morning" if session_num == 0 else "Afternoon"
            time_window = "09:15–12:00" if session_num == 0 else "12:00–15:30"

            impact_per_share = p.eta * (n / p.tau) if n > 0 else 0.0
            session_cost = impact_per_share * n * p.price
            cumulative_shares += int(round(n))
            cumulative_cost += session_cost

            sessions.append({
                "session_id": j,
                "label": f"Day {day} {session_label}",
                "day": day,
                "time_window_ist": time_window,
                "shares": float(round(n)),
                "impact_per_share_inr": float(round(impact_per_share * p.price, 4)),
                "session_cost_inr": float(round(session_cost, 2)),
                "cumulative_shares": cumulative_shares,
                "cumulative_cost_inr": float(round(cumulative_cost, 2)),
            })

        return {
            "model": "Almgren-Chriss",
            "parameters": {
                "sigma_annual": p.sigma,
                "eta": p.eta,
                "gamma": p.gamma,
                "kappa": float(self._kappa()),
                "lambda_risk": p.lambda_risk,
                "horizon_days": p.horizon_days,
                "total_sessions": p.T,
            },
            "schedule": sessions,
            "cost_breakdown": costs,
            "trajectory": self.optimal_trajectory().tolist(),
        }
