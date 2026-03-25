"""
train_agent.py
──────────────
Run this ONCE to pre-train the QR-DQN agent before deploying.

Usage:
    cd arxis-backend
    python train_agent.py

    # Custom timesteps:
    python train_agent.py --timesteps 1000000

The trained model is saved to models/saved/qrdqn_execution.zip
and loaded automatically by the API at startup.

Training time:
  ~10-20 min on CPU (500k steps)
  ~5 min on GPU (500k steps)

The agent is trained across a distribution of market conditions
(varying sigma, vix, regime) so it generalises to all NSE stocks.
"""

import argparse
import sys
from pathlib import Path

# Make sure we can import from models/
sys.path.insert(0, str(Path(__file__).parent))


def main():
    parser = argparse.ArgumentParser(description="Train ARXIS QR-DQN agent")
    parser.add_argument("--timesteps", type=int, default=500_000,
                        help="Total training timesteps (default: 500000)")
    parser.add_argument("--sigma", type=float, default=0.22,
                        help="Annual volatility for training env")
    parser.add_argument("--vix", type=float, default=15.0,
                        help="India VIX level for training env")
    parser.add_argument("--regime", type=int, default=1, choices=[0,1,2,3],
                        help="Initial regime (0-3)")
    args = parser.parse_args()

    print("=" * 60)
    print("ARXIS QR-DQN Agent Training")
    print("=" * 60)
    print(f"  Timesteps  : {args.timesteps:,}")
    print(f"  Sigma      : {args.sigma}")
    print(f"  VIX        : {args.vix}")
    print(f"  Init Regime: {args.regime}")
    print("=" * 60)

    from models.rl_agent import train_agent

    env_params = {
        "sigma_annual": args.sigma,
        "vix_level": args.vix,
        "init_regime": args.regime,
    }

    train_agent(
        total_timesteps=args.timesteps,
        env_params=env_params,
    )

    print("\n[DONE] Model saved. The ARXIS API will load it automatically.")
    print("       Deploy with: uvicorn main:app --host 0.0.0.0 --port $PORT")


if __name__ == "__main__":
    main()
