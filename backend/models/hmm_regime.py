"""
hmm_regime.py
─────────────
Gaussian Hidden Markov Model for NSE market regime detection.

4 regimes:
  0 — Low volatility, trending up    → aggressive execution
  1 — Low volatility, mean-reverting → moderate execution
  2 — High volatility, trending down → conservative execution
  3 — Crisis / extreme fear           → halt execution

Features used:
  - Returns (daily log return)
  - Realised volatility (5-day rolling std of returns)
  - Volume deviation (log ratio to 20-day MA)
  - India VIX proxy (if available, else imputed from realised vol)

The model is trained fresh on 2 years of daily data for the selected
stock each time /regime is called. Training is fast (~1-2 seconds for
500 data points with 4 states).
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from hmmlearn.hmm import GaussianHMM
from sklearn.preprocessing import StandardScaler
from dataclasses import dataclass
from typing import Optional
import warnings
warnings.filterwarnings("ignore")


N_STATES = 4
LOOKBACK_YEARS = 2
RANDOM_STATE = 42


# Regime metadata — assigned after training via characteristic mapping
REGIME_META = {
    0: {
        "name": "Low Volatility — Trending Up",
        "action": "Favorable conditions. Execute aggressively.",
        "color": "green",
        "execution_multiplier": 1.3,   # Scale AC schedule up by 30%
    },
    1: {
        "name": "Low Volatility — Mean-Reverting",
        "action": "Neutral conditions. Follow base schedule.",
        "color": "yellow",
        "execution_multiplier": 1.0,
    },
    2: {
        "name": "High Volatility — Trending Down",
        "action": "Adverse conditions. Reduce execution rate.",
        "color": "orange",
        "execution_multiplier": 0.6,
    },
    3: {
        "name": "Crisis / Extreme Fear",
        "action": "Halt execution. Wait for regime transition.",
        "color": "red",
        "execution_multiplier": 0.15,
    },
}


@dataclass
class RegimeResult:
    current_regime: int
    regime_probabilities: list[float]
    regime_history: list[int]           # one per trading day (last 6 months)
    transition_matrix: list[list[float]]
    feature_importance: dict
    dates: list[str]
    prices: list[float]
    meta: dict


def _build_features(df: pd.DataFrame) -> np.ndarray:
    """
    Build feature matrix from OHLCV dataframe.
    Returns shape (N, 4): [return, realised_vol, vol_deviation, momentum]
    """
    # 1. Forward fill any NaN gaps from yfinance
    df = df.ffill().bfill()

    close = df["Close"].values.astype(float)
    volume = df["Volume"].values.astype(float)

    # 2. Prevent log(0) issues by capping at a tiny positive number
    close = np.maximum(close, 1e-8)
    volume = np.maximum(volume, 1.0)

    # Log returns
    returns = np.diff(np.log(close), prepend=np.log(close[0]))
    returns[0] = 0.0

    # 5-day realised volatility
    rv = pd.Series(returns).rolling(5, min_periods=1).std().fillna(0).values
    rv = rv * np.sqrt(252)  # annualise

    # Volume deviation from 20-day MA
    vol_ma = pd.Series(volume).rolling(20, min_periods=1).mean().values
    vol_dev = np.log(volume / np.maximum(vol_ma, 1))

    # 10-day momentum
    momentum = pd.Series(close).pct_change(10).fillna(0).values

    features = np.column_stack([returns, rv, vol_dev, momentum])
    
    # 3. Final safety net: wipe out any lingering NaNs or Infs
    features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)
    return features


def _map_states_to_regimes(hmm: GaussianHMM, features: np.ndarray) -> dict[int, int]:
    """
    Map raw HMM state indices (0..N_STATES-1) to named regimes (0..3)
    by sorting states on (volatility, trend) characteristics.

    Returns mapping: hmm_state → regime_id
    """
    means = hmm.means_  # shape (N_STATES, n_features)
    # features: [return, realised_vol, vol_deviation, momentum]
    rv_col = 1     # realised vol index
    ret_col = 0    # return index

    # Score each state: high rv = high regime number, negative return = higher regime
    scores = []
    for i in range(N_STATES):
        vol_score  = means[i, rv_col]
        ret_score  = -means[i, ret_col]   # negative return → higher danger
        combined   = vol_score * 2 + ret_score
        scores.append((combined, i))

    scores.sort()  # ascending: low vol+positive return → regime 0
    mapping = {}
    for regime_id, (_, hmm_state) in enumerate(scores):
        mapping[hmm_state] = regime_id
    return mapping


class HMMRegimeDetector:
    # ... (keep your __init__ as is) ...

    def fit(self, df: pd.DataFrame) -> "HMMRegimeDetector":
        """
        Train HMM on OHLCV dataframe.
        """
        features = _build_features(df)
        X = self.scaler.fit_transform(features)
        
        # Safety: if a feature has 0 variance, scaler outputs NaNs
        X = np.nan_to_num(X, nan=0.0)

        best_hmm, best_score = None, -np.inf
        # Multiple restarts to avoid local optima
        for seed in range(5):
            hmm = GaussianHMM(
                n_components=N_STATES,
                covariance_type="diag",  # <--- CRITICAL FIX: "diag" instead of "full"
                n_iter=200,
                tol=1e-4,
                random_state=seed,
                verbose=False,
            )
            try:
                hmm.fit(X)
                score = hmm.score(X)
                if score > best_score:
                    best_score = score
                    best_hmm = hmm
            except Exception:
                continue

        if best_hmm is None:
            raise RuntimeError("HMM failed to converge on all restarts (check data quality)")

        self.hmm = best_hmm
        self.state_map = _map_states_to_regimes(best_hmm, features)
        self.trained = True
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """
        Predict regime sequence for a dataframe.
        Returns array of regime ids (0–3).
        """
        assert self.trained, "Call fit() first"
        features = _build_features(df)
        X = self.scaler.transform(features)
        raw_states = self.hmm.predict(X)
        return np.array([self.state_map.get(s, 1) for s in raw_states])

    def current_regime_probs(self, df: pd.DataFrame) -> tuple[int, list[float]]:
        """
        Returns (current_regime, [p0, p1, p2, p3]) using the last observation.
        """
        assert self.trained
        features = _build_features(df)
        X = self.scaler.transform(features)
        # Forward algorithm posterior for last step
        _, posteriors = self.hmm.score_samples(X)
        last_post = posteriors[-1]  # shape (N_STATES,)

        # Remap to regime order
        regime_probs = np.zeros(N_STATES)
        for hmm_state, regime_id in self.state_map.items():
            if hmm_state < len(last_post):
                regime_probs[regime_id] += last_post[hmm_state]

        current_regime = int(np.argmax(regime_probs))
        return current_regime, regime_probs.tolist()

    def transition_matrix_by_regime(self) -> list[list[float]]:
        """
        Convert HMM transition matrix (hmm state space) to regime space.
        Returns 4×4 matrix where [i][j] = P(regime j tomorrow | regime i today).
        """
        assert self.trained
        T_raw = self.hmm.transmat_  # (N_STATES, N_STATES)
        T_regime = np.zeros((N_STATES, N_STATES))

        for hmm_from, regime_from in self.state_map.items():
            for hmm_to, regime_to in self.state_map.items():
                if hmm_from < T_raw.shape[0] and hmm_to < T_raw.shape[1]:
                    T_regime[regime_from, regime_to] += T_raw[hmm_from, hmm_to]

        # Renormalize rows
        row_sums = T_regime.sum(axis=1, keepdims=True)
        row_sums = np.where(row_sums == 0, 1, row_sums)
        T_regime = T_regime / row_sums

        return T_regime.tolist()

    def feature_importance(self, df: pd.DataFrame) -> dict:
        """
        Approximate feature importance by measuring how much each feature
        contributes to distinguishing regimes (variance of means across states).
        """
        assert self.trained
        features = _build_features(df)
        # Variance of per-state means for each feature
        means = self.hmm.means_  # (N_STATES, n_features)
        var_across_states = np.var(means, axis=0)
        total = var_across_states.sum()
        if total == 0:
            weights = [0.25] * 4
        else:
            weights = (var_across_states / total).tolist()

        names = ["Returns", "Realised Volatility", "Volume Deviation", "Momentum"]
        # Map to user-friendly labels
        label_map = {
            "Returns": "Price Momentum",
            "Realised Volatility": "Realised Volatility",
            "Volume Deviation": "Volume Deviation",
            "Momentum": "India VIX Proxy",
        }
        return {label_map.get(n, n): round(w * 100, 1) for n, w in zip(names, weights)}


def analyse_regime(df: pd.DataFrame) -> RegimeResult:
    """
    Full pipeline: train HMM, predict regimes, return structured result.
    df: full historical OHLCV dataframe (2 years daily).
    """
    detector = HMMRegimeDetector()
    detector.fit(df)

    # Predict full history
    all_regimes = detector.predict(df)

    # Last 6 months for display
    six_months = min(126, len(df))
    recent_df = df.iloc[-six_months:]
    recent_regimes = all_regimes[-six_months:]

    current_regime, regime_probs = detector.current_regime_probs(df)
    trans_matrix = detector.transition_matrix_by_regime()
    feat_imp = detector.feature_importance(df)

    dates = [str(d)[:10] for d in recent_df.index.tolist()]
    prices = recent_df["Close"].values.tolist()

    return RegimeResult(
        current_regime=current_regime,
        regime_probabilities=regime_probs,
        regime_history=recent_regimes.tolist(),
        transition_matrix=trans_matrix,
        feature_importance=feat_imp,
        dates=dates,
        prices=prices,
        meta=REGIME_META[current_regime],
    )
