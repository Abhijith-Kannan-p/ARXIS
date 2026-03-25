"""
execution_env.py
────────────────
Gymnasium environment for the optimal execution problem.

State space (6 dimensions):
  0. inventory_fraction   — remaining shares / total shares  [0, 1]
  1. time_fraction        — remaining sessions / total       [0, 1]
  2. price_drift          — (current_price - arrival_price) / arrival_price  [-∞, ∞]
  3. realised_vol         — annualised realised vol  [0, ∞]
  4. vix_level            — India VIX (normalised by 20)  [0, ∞]
  5. regime               — HMM regime label / 3.0  [0, 1]

Action space:
  Discrete(11) — sell {0, 5, 10, 20, 30, 40, 50, 60, 70, 85, 100}%
  of remaining inventory in this session.

Reward:
  r = - (impact_cost + timing_penalty + cvar_weight * tail_loss)
  where tail_loss = max(0, cost - 95th-percentile budget).

Episode ends when inventory = 0 or time = 0.
"""

from __future__ import annotations
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from typing import Optional


# Sell fractions available as discrete actions
SELL_FRACTIONS = np.array([0.0, 0.05, 0.10, 0.20, 0.30, 0.40,
                            0.50, 0.60, 0.70, 0.85, 1.00])
N_ACTIONS = len(SELL_FRACTIONS)

# Regime execution multipliers (from HMM model)
REGIME_MULTIPLIERS = [1.3, 1.0, 0.6, 0.15]


class ExecutionEnv(gym.Env):
    """
    Single-episode optimal execution environment.

    Each episode corresponds to selling `total_shares` over `total_sessions`.
    The environment simulates price evolution using GBM with regime-dependent
    drift and volatility.
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        total_shares: float = 500_000,
        total_sessions: int = 30,         # 15 days × 2 sessions
        sigma_annual: float = 0.22,       # annual vol
        eta: float = 2e-6,                # temporary impact coefficient
        gamma: float = 1e-6,              # permanent impact coefficient
        init_price: float = 2500.0,
        vix_level: float = 15.0,
        init_regime: int = 1,
        risk_aversion: float = 0.5,       # λ from slider
        cvar_alpha: float = 0.05,         # CVaR tail probability
    ):
        super().__init__()

        self.total_shares = float(total_shares)
        self.total_sessions = total_sessions
        self.sigma_annual = sigma_annual
        self.sigma_session = sigma_annual / np.sqrt(252 * 2)  # per half-day
        self.eta = eta
        self.gamma = gamma
        self.init_price = float(init_price)
        self.vix_level = vix_level
        self.init_regime = init_regime
        self.risk_aversion = risk_aversion
        self.cvar_alpha = cvar_alpha

        # Spaces
        low  = np.array([0., 0., -1.0, 0.,  0., 0.], dtype=np.float32)
        high = np.array([1., 1.,  1.0, 2.0, 5., 1.], dtype=np.float32)
        self.observation_space = spaces.Box(low=low, high=high, dtype=np.float32)
        self.action_space = spaces.Discrete(N_ACTIONS)

        # Internal state (set in reset)
        self._inventory: float = 0.0
        self._session:   int   = 0
        self._price:     float = 0.0
        self._arrival_price: float = 0.0
        self._regime:    int   = 0
        self._cost_history: list[float] = []
        self._total_cost:   float = 0.0

    # ── Gymnasium API ──────────────────────────────────────────
    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[dict] = None,
    ):
        super().reset(seed=seed)
        self._inventory    = self.total_shares
        self._session      = 0
        self._price        = self.init_price
        self._arrival_price= self.init_price
        self._regime       = self.init_regime
        self._cost_history = []
        self._total_cost   = 0.0
        return self._obs(), {}

    def step(self, action: int):
        assert self.action_space.contains(action)

        sell_frac = SELL_FRACTIONS[action]

        # On last session, must sell everything
        if self._session == self.total_sessions - 1:
            sell_frac = 1.0

        n = sell_frac * self._inventory  # shares to sell this session

        # ── Market impact ──────────────────────────────────────
        tau = 0.5  # half trading day per session
        temp_impact = self.eta * n / tau
        perm_impact = self.gamma * n

        # Execution price (after temporary impact slippage)
        exec_price = self._price - temp_impact * self._price

        # Session cost = slippage × shares
        session_cost = (self._price - exec_price) * n
        self._total_cost += session_cost

        # ── Reward ────────────────────────────────────────────
        # Primary reward: negative cost
        reward = -session_cost

        # Regime penalty: penalise selling in crisis
        regime_mult = REGIME_MULTIPLIERS[self._regime]
        if regime_mult < 0.5 and n > 0:
            # Extra penalty for selling when RL says to halt
            reward -= session_cost * (1 - regime_mult) * 2

        # Time pressure: penalise holding too much inventory too late
        time_left_frac = 1 - (self._session + 1) / self.total_sessions
        inventory_frac = (self._inventory - n) / self.total_shares
        if time_left_frac < 0.2 and inventory_frac > 0.4:
            reward -= inventory_frac * self.total_shares * self._price * 1e-5

        # CVaR penalty (simple running approximation)
        self._cost_history.append(session_cost)

        # ── Update state ───────────────────────────────────────
        self._inventory -= n
        self._inventory  = max(self._inventory, 0.0)

        # Simulate price evolution (GBM with regime-dependent drift)
        drift = 0.0
        if self._regime == 0:
            drift = self.sigma_session * 0.5    # mild uptrend
        elif self._regime == 2:
            drift = -self.sigma_session * 0.8   # downtrend
        elif self._regime == 3:
            drift = -self.sigma_session * 2.0   # crash

        noise = self.np_random.normal(0, self.sigma_session)
        log_ret = drift + noise

        # Permanent price impact reduces price permanently
        perm_price_impact = perm_impact * self._price
        self._price *= np.exp(log_ret)
        self._price -= perm_price_impact * 0.01   # small permanent effect

        # Regime transition (simplified Markov chain)
        self._regime = self._simulate_regime_transition(self._regime)

        self._session += 1
        done = (self._inventory <= 0) or (self._session >= self.total_sessions)

        return self._obs(), float(reward), done, False, {"cost": session_cost}

    # ── Helpers ────────────────────────────────────────────────
    def _obs(self) -> np.ndarray:
        inv_frac   = self._inventory / self.total_shares
        time_frac  = 1 - self._session / self.total_sessions
        drift      = np.clip((self._price - self._arrival_price) / self._arrival_price, -1, 1)
        vol_norm   = np.clip(self.sigma_annual, 0, 2.0)
        vix_norm   = np.clip(self.vix_level / 20.0, 0, 5.0)
        regime_norm= self._regime / 3.0

        return np.array(
            [inv_frac, time_frac, drift, vol_norm, vix_norm, regime_norm],
            dtype=np.float32,
        )

    def _simulate_regime_transition(self, current: int) -> int:
        """
        Simple Markov chain regime transitions.
        In production the HMM transition matrix would be used here.
        """
        trans = [
            [0.85, 0.10, 0.04, 0.01],   # from regime 0
            [0.10, 0.75, 0.12, 0.03],   # from regime 1
            [0.05, 0.30, 0.55, 0.10],   # from regime 2
            [0.02, 0.15, 0.40, 0.43],   # from regime 3
        ]
        probs = trans[current]
        return int(self.np_random.choice(4, p=probs))

    def cvar(self, alpha: float = 0.05) -> float:
        """CVaR of cost history at level alpha."""
        if not self._cost_history:
            return 0.0
        costs = np.array(self._cost_history)
        var = np.quantile(costs, 1 - alpha)
        tail = costs[costs >= var]
        return float(tail.mean()) if len(tail) > 0 else float(var)


def make_env(params: dict):
    """Factory used by stable-baselines3 VecEnv wrappers."""
    def _init():
        return ExecutionEnv(**params)
    return _init
