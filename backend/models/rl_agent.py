"""
rl_agent.py
───────────
Quantile Regression DQN (QR-DQN) agent for optimal execution.

Uses sb3-contrib's QRDQN implementation.
The agent optimises the full distribution of execution costs —
minimising CVaR rather than just expected cost.

Workflow:
  1. train_agent()   — called once offline (train_agent.py script)
                       saves model to models/saved/qrdqn_execution.zip
  2. load_agent()    — loads saved model at API startup
  3. generate_rl_schedule() — runs the loaded agent on new parameters,
                       returning session-by-session trade schedule

If no saved model exists, falls back to AC-perturbed heuristic
that approximates what a trained RL agent would do.
"""

from __future__ import annotations
import os
import numpy as np
from pathlib import Path
from typing import Optional

MODEL_PATH = Path(__file__).parent / "saved" / "qrdqn_execution.zip"


# ──────────────────────────────────────────────────────────────
#  Lazy imports (torch + sb3 are heavy — only import when needed)
# ──────────────────────────────────────────────────────────────
def _import_rl():
    try:
        from sb3_contrib import QRDQN
        from stable_baselines3.common.env_util import make_vec_env
        return QRDQN, make_vec_env
    except ImportError as e:
        raise ImportError(
            "sb3-contrib not installed. Run: pip install sb3-contrib"
        ) from e


# ──────────────────────────────────────────────────────────────
#  Training
# ──────────────────────────────────────────────────────────────
def train_agent(
    total_timesteps: int = 500_000,
    env_params: Optional[dict] = None,
    save_path: Path = MODEL_PATH,
) -> None:
    """
    Train the QR-DQN agent.
    Run this via: python train_agent.py

    Training takes ~10-30 minutes on CPU, ~5 min on GPU.
    """
    QRDQN, make_vec_env = _import_rl()
    from models.execution_env import ExecutionEnv, make_env

    save_path.parent.mkdir(parents=True, exist_ok=True)

    default_params = {
        "total_shares": 500_000,
        "total_sessions": 30,
        "sigma_annual": 0.22,
        "eta": 2e-6,
        "gamma": 1e-6,
        "init_price": 2500.0,
        "vix_level": 15.0,
        "init_regime": 1,
        "risk_aversion": 0.5,
    }
    if env_params:
        default_params.update(env_params)

    # Vectorised environments for parallel training
    n_envs = 4
    vec_env = make_vec_env(
        ExecutionEnv,
        n_envs=n_envs,
        env_kwargs=default_params,
    )

    model = QRDQN(
        policy="MlpPolicy",
        env=vec_env,
        learning_rate=1e-4,
        buffer_size=100_000,
        learning_starts=5_000,
        batch_size=256,
        tau=0.01,
        gamma=0.99,
        train_freq=4,
        gradient_steps=2,
        n_quantiles=51,           # QR-DQN: 51 quantiles for cost distribution
        target_update_interval=500,
        exploration_fraction=0.15,
        exploration_final_eps=0.02,
        policy_kwargs={"net_arch": [256, 256, 128]},
        verbose=1,
        tensorboard_log="./logs/",
    )

    model.learn(
        total_timesteps=total_timesteps,
        progress_bar=True,
    )
    model.save(str(save_path))
    print(f"[QR-DQN] Model saved → {save_path}")


# ──────────────────────────────────────────────────────────────
#  Inference
# ──────────────────────────────────────────────────────────────
_cached_model = None


def load_agent():
    """Load the saved QR-DQN model (cached after first load)."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model

    QRDQN, _ = _import_rl()

    if not MODEL_PATH.exists():
        return None  # triggers fallback heuristic

    _cached_model = QRDQN.load(str(MODEL_PATH))
    print(f"[QR-DQN] Model loaded from {MODEL_PATH}")
    return _cached_model


def generate_rl_schedule(
    total_shares: float,
    total_sessions: int,
    sigma_annual: float,
    eta: float,
    gamma: float,
    init_price: float,
    vix_level: float,
    regime_sequence: list[int],
    ac_schedule: list[float],
    risk_aversion: float = 0.5,
) -> list[float]:
    """
    Run the RL agent (or fallback heuristic) to produce a trade schedule.

    regime_sequence: predicted regime for each session
    ac_schedule:     Almgren-Chriss baseline (same length)

    Returns: list of shares to sell per session (sums to total_shares).
    """
    from models.execution_env import ExecutionEnv

    model = load_agent()

    if model is not None:
        # ── Use trained QR-DQN ────────────────────────────────
        env = ExecutionEnv(
            total_shares=total_shares,
            total_sessions=total_sessions,
            sigma_annual=sigma_annual,
            eta=eta,
            gamma=gamma,
            init_price=init_price,
            vix_level=vix_level,
            init_regime=regime_sequence[0] if regime_sequence else 1,
            risk_aversion=risk_aversion,
        )
        obs, _ = env.reset()
        schedule = []
        done = False
        prev_inv = total_shares

        # Do the calculation directly here!
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, truncated, info = env.step(int(action))
            
            sold = prev_inv - env._inventory
            schedule.append(max(sold, 0.0))
            prev_inv = env._inventory
    else:
        # ── Fallback: regime-aware heuristic ─────────────────
        schedule = _heuristic_rl_schedule(
            total_shares, total_sessions, regime_sequence,
            ac_schedule, vix_level, risk_aversion
        )

    # Normalize to exactly total_shares
    s = np.array(schedule, dtype=float)
    if s.sum() > 0:
        s = s * (total_shares / s.sum())
    return s.tolist()


def _heuristic_rl_schedule(
    total_shares: float,
    total_sessions: int,
    regime_sequence: list[int],
    ac_schedule: list[float],
    vix_level: float,
    risk_aversion: float,
) -> list[float]:
    """
    Regime-aware heuristic that approximates trained QR-DQN behaviour.

    Logic that mirrors what a CVaR-minimising agent learns:
    1. In regime 0 (bull): sell MORE than AC in early sessions
    2. In regime 1 (neutral): follow AC closely
    3. In regime 2 (bear): sell LESS, defer to later
    4. In regime 3 (crisis): near-halt, minimal sells
    5. High VIX: further scale down regardless of regime
    6. CVaR adjustment: front-load when regime is stable to reduce tail risk
    """
    from models.hmm_regime import REGIME_META

    n = total_sessions
    ac = np.array(ac_schedule[:n], dtype=float)
    if len(ac) < n:
        # Pad if needed
        ac = np.concatenate([ac, np.zeros(n - len(ac))])

    regimes = list(regime_sequence[:n])
    if len(regimes) < n:
        regimes += [1] * (n - len(regimes))

    # Per-session multipliers based on regime
    mult_map = {0: 1.35, 1: 1.0, 2: 0.55, 3: 0.12}

    # VIX dampening: VIX > 20 → reduce across the board
    vix_factor = 1.0
    if vix_level > 25:
        vix_factor = 0.75
    elif vix_level > 20:
        vix_factor = 0.88
    elif vix_level < 12:
        vix_factor = 1.1   # very low VIX → can be aggressive

    rl = np.zeros(n)
    for j in range(n):
        regime = regimes[j]
        m = mult_map.get(regime, 1.0) * vix_factor

        # Risk aversion modifier
        if risk_aversion > 0.7:
            m = min(m, 0.9)   # conservative: cap acceleration
        elif risk_aversion < 0.3:
            m = m * 1.1       # aggressive: slight boost

        rl[j] = ac[j] * m

    # Redistribute deferred shares to stable-regime sessions
    ac_total = ac.sum()
    rl_total = rl.sum()
    deferred = ac_total - rl_total

    if deferred > 0:
        # Find sessions in regime 0 or 1 after the deferred period
        boost_sessions = [j for j, r in enumerate(regimes) if r in (0, 1)]
        if not boost_sessions:
            boost_sessions = list(range(n))
        weights = np.array([ac[j] for j in boost_sessions])
        if weights.sum() > 0:
            weights = weights / weights.sum()
            for idx, j in enumerate(boost_sessions):
                rl[j] += deferred * weights[idx]

    # Ensure non-negative
    rl = np.maximum(rl, 0)

    return rl.tolist()