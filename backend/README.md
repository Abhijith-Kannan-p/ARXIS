# ARXIS Backend

**Adaptive Regime-aware eXecution Intelligence System**  
FastAPI backend for institutional execution analytics on NSE equities.

---

## Architecture

```
User Input (Frontend)
       │
       ▼
POST /api/v1/execution/generate
       │
       ├── yfinance → live price, volume, 2yr OHLCV
       │
       ├── HMM (hmmlearn) → train on 2yr data → current regime + transition matrix
       │
       ├── Almgren-Chriss (closed-form) → optimal baseline schedule
       │
       ├── QR-DQN Agent (sb3-contrib) → regime-adaptive RL schedule
       │                                 (loads pre-trained model or heuristic fallback)
       │
       └── Monte Carlo simulator (numpy) → cost distribution, CVaR, stress tests
```

---

## Setup

### 1. Install dependencies

```bash
cd arxis-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Train the RL agent (ONCE, before first deploy)

```bash
python train_agent.py
# Default: 500,000 steps (~15 min CPU)
# Saves to: models/saved/qrdqn_execution.zip

# Longer training for better quality:
python train_agent.py --timesteps 1000000
```

> **Note:** If you skip this step the API still works — it falls back to
> the regime-aware heuristic in `rl_agent.py`. The heuristic accurately
> approximates what a trained agent would do for moderate market conditions.

### 3. Run locally

```bash
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/stocks/search?q=RELIANCE` | Search NSE stocks |
| GET | `/api/v1/stocks/{ticker}/profile` | Price, vol, regime |
| GET | `/api/v1/stocks/{ticker}/regime` | Full HMM analysis |
| POST | `/api/v1/execution/generate` | **Main endpoint** — generate strategy |
| GET | `/api/v1/execution/{id}/schedule` | Session-by-session schedule |
| GET | `/api/v1/execution/{id}/risk` | CVaR, cost distribution |
| POST | `/api/v1/execution/{id}/simulate` | Stress test scenario |
| GET | `/api/v1/execution/{id}/report` | Post-execution report |

### POST /api/v1/execution/generate

```json
{
  "ticker": "RELIANCE.NS",
  "shares": 500000,
  "horizon_days": 15,
  "risk_preference": 0.5
}
```

`risk_preference`: 0.0 = minimize cost (aggressive), 1.0 = minimize risk (conservative)

### POST /api/v1/execution/{id}/simulate

```json
{ "scenario": "normal" }
{ "scenario": "high_vol" }
{ "scenario": "flash_crash" }
```

---

## Models

### `models/almgren_chriss.py`
Closed-form Almgren-Chriss (2001) optimal trajectory.  
Parameters are live-calibrated from yfinance volatility and volume data.  
No training needed.

### `models/hmm_regime.py`
4-state Gaussian HMM trained fresh on 2 years of daily data for each request.  
Training takes ~1-2 seconds per ticker.  
Regime mapping (0=bull, 1=neutral, 2=bear, 3=crisis) is determined by
sorting states on volatility × return characteristics.

### `models/execution_env.py`
Gymnasium environment for the execution problem.  
State: [inventory_frac, time_frac, price_drift, realised_vol, vix, regime]  
Actions: sell 0/5/10/20/30/40/50/60/70/85/100% of remaining inventory

### `models/rl_agent.py`
QR-DQN agent using `sb3-contrib`.  
- `train_agent()` — offline training (run via `train_agent.py`)
- `load_agent()` — loads pre-trained model at API startup
- `generate_rl_schedule()` — inference with regime-aware heuristic fallback

### `models/simulator.py`
Monte Carlo with 1000 GBM scenarios + regime transitions.  
Computes: expected cost, median, 95% CVaR, worst case, P(exceed budget).  
Supports three stress scenarios: normal, high_vol, flash_crash.

---

## Deployment on Railway

1. Push this folder to a GitHub repo
2. Create new Railway project → **Deploy from GitHub repo**
3. Railway auto-detects `Procfile` and runs:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Set environment variable if needed:
   ```
   FRONTEND_URL=https://your-frontend.railway.app
   ```

**Important:** Run `train_agent.py` locally first and commit
`models/saved/qrdqn_execution.zip` to the repo so Railway deploys
with the pre-trained model. Otherwise the API uses the heuristic fallback.

---

## Data Note

All market data is sourced from Yahoo Finance via `yfinance`.
Prices are delayed approximately 15 minutes.

For real-time production use, replace `_fetch_stock_data()` in
`routers/execution.py` and `routers/stocks.py` with:
- **Upstox API** — `pip install upstox-python-sdk`
- **Angel One SmartAPI** — `pip install smartapi-python`
