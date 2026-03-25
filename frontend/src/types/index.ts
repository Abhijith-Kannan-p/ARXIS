// ── Stock types ────────────────────────────────────────────────
export interface StockSearchResult {
  ticker: string
  name: string
  sector: string
  price_inr: number
  change_pct: number
  avg_daily_volume: number
  data_delay_note?: string
}

export interface CircuitLimits {
  upper_circuit_inr: number
  lower_circuit_inr: number
  upper_pct: number
  lower_pct: number
}

export interface RegimeMeta {
  name: string
  action: string
  color: 'green' | 'yellow' | 'orange' | 'red'
  execution_multiplier: number
}

export interface StockProfile {
  ticker: string
  name: string
  sector: string
  price_inr: number
  change_pct: number
  avg_daily_volume: number
  realised_vol_30d_pct: number
  market_cap_cr: number | null
  circuit_limits: CircuitLimits
  india_vix: number
  current_regime: 0 | 1 | 2 | 3
  regime_meta: RegimeMeta
  data_delay_note: string
}

// ── Regime types ───────────────────────────────────────────────
export interface RegimeData {
  ticker: string
  current_regime: 0 | 1 | 2 | 3
  regime_probabilities: number[]
  regime_meta: RegimeMeta
  regime_history: number[]
  transition_matrix: number[][]
  feature_importance: Record<string, number>
  price_history: {
    dates: string[]
    prices: number[]
  }
}

// ── Execution types ────────────────────────────────────────────
export interface GenerateRequest {
  ticker: string
  shares: number
  horizon_days: number
  risk_preference: number  // 0–1
}

export interface GenerateResponse {
  execution_id: string
  ticker: string
  shares: number
  horizon_days: number
  current_regime: 0 | 1 | 2 | 3
  regime_meta: RegimeMeta
  ac_summary: {
    expected_cost_inr: number
    basis_points: number
    schedule: number[]
  }
  rl_summary: {
    expected_cost_inr: number
    cvar_95_inr: number
    schedule: number[]
  }
  savings_inr: number
  savings_pct: number
  sebi_compliant: boolean
  regime_full?: RegimeData
}

export interface ScheduleSession {
  session_id: number
  label: string
  day: number
  time_window_ist: string
  ac_shares: number
  rl_shares: number
  diff: number
  impact_per_share_inr: number
  regime: 0 | 1 | 2 | 3
  regime_name: string
  ac_cumulative: number
  ac_cost_cumulative: number
}

export interface ScheduleData {
  execution_id: string
  ticker: string
  sessions: ScheduleSession[]
  intraday_profile: {
    slots: string[]
    relative_volume: number[]
  }
}

export interface HistogramData {
  bins: number[]
  counts: number[]
  bin_width: number
}

export interface ScenarioResult {
  expected_cost_inr: number
  median_cost_inr: number
  cvar_95_inr: number
  worst_case_inr: number
  prob_exceed_budget: number
  histogram: HistogramData
}

export interface RiskComparison {
  scenario: string
  classical_ac: ScenarioResult
  rl_optimized: ScenarioResult
  improvement: {
    expected_cost_pct: number
    median_cost_pct: number
    cvar_95_pct: number
    worst_case_pct: number
    savings_inr: number
  }
}

export interface RiskData {
  execution_id: string
  ticker: string
  comparison: RiskComparison
}

export interface ReportData {
  execution_id: string
  ticker: string
  shares: number
  horizon_days: number
  arrival_price_inr: number
  india_vix: number
  current_regime: 0 | 1 | 2 | 3
  regime_meta: RegimeMeta
  created_at: string
  performance: {
    ac_cost_inr: number
    rl_cost_inr: number
    savings_inr: number
    savings_pct: number
    ac_bps: number
  }
  slippage_attribution: {
    permanent_impact_pct: number
    temporary_impact_pct: number
    timing_risk_pct: number
    regime_delays_pct: number
  }
  regime_journey: number[]
  sebi_compliance: {
    pre_planned: boolean
    horizon_days: number
    blackout_clear: boolean
    compliant: boolean
  }
}

// ── UI types ───────────────────────────────────────────────────
export type RegimeId = 0 | 1 | 2 | 3

export const REGIME_NAMES: Record<RegimeId, string> = {
  0: 'Low Volatility — Trending Up',
  1: 'Low Volatility — Mean-Reverting',
  2: 'High Volatility — Trending Down',
  3: 'Crisis / Extreme Fear',
}

export const REGIME_ACTIONS: Record<RegimeId, string> = {
  0: 'Favorable conditions. Execute aggressively.',
  1: 'Neutral conditions. Follow base schedule.',
  2: 'Adverse conditions. Reduce execution rate.',
  3: 'Halt execution. Wait for regime transition.',
}

export const REGIME_COLORS: Record<RegimeId, string> = {
  0: '#a6e3a1',
  1: '#f9e2af',
  2: '#fab387',
  3: '#f38ba8',
}

export const REGIME_BG: Record<RegimeId, string> = {
  0: 'rgba(166,227,161,0.12)',
  1: 'rgba(249,226,175,0.12)',
  2: 'rgba(250,179,135,0.12)',
  3: 'rgba(243,139,168,0.12)',
}

export const NSE_UNIVERSE = [
  { ticker:'TCS.NS',        name:'Tata Consultancy Services', price:3812.40, chg:-0.32, sector:'Technology', regime:0 as RegimeId },
  { ticker:'INFY.NS',       name:'Infosys',                   price:1789.55, chg:-0.18, sector:'Technology', regime:0 as RegimeId },
  { ticker:'WIPRO.NS',      name:'Wipro',                     price:498.20,  chg:+0.12, sector:'Technology', regime:0 as RegimeId },
  { ticker:'HDFCBANK.NS',   name:'HDFC Bank',                 price:1642.90, chg:+1.21, sector:'Finance',    regime:1 as RegimeId },
  { ticker:'ICICIBANK.NS',  name:'ICICI Bank',                price:1198.30, chg:+0.67, sector:'Finance',    regime:1 as RegimeId },
  { ticker:'KOTAKBANK.NS',  name:'Kotak Mahindra Bank',       price:1842.60, chg:-0.44, sector:'Finance',    regime:1 as RegimeId },
  { ticker:'RELIANCE.NS',   name:'Reliance Industries',       price:2489.75, chg:+0.84, sector:'Energy',     regime:1 as RegimeId },
  { ticker:'ONGC.NS',       name:'Oil & Natural Gas Corp',    price:264.30,  chg:+1.12, sector:'Energy',     regime:2 as RegimeId },
  { ticker:'HINDUNILVR.NS', name:'Hindustan Unilever',        price:2318.45, chg:-0.22, sector:'Consumer',   regime:0 as RegimeId },
  { ticker:'ITC.NS',        name:'ITC Limited',               price:452.80,  chg:+0.38, sector:'Consumer',   regime:1 as RegimeId },
  { ticker:'TATAMOTORS.NS', name:'Tata Motors',               price:714.85,  chg:-1.43, sector:'Auto',       regime:2 as RegimeId },
  { ticker:'MARUTI.NS',     name:'Maruti Suzuki',             price:11248.0, chg:+0.62, sector:'Auto',       regime:1 as RegimeId },
  { ticker:'SUNPHARMA.NS',  name:'Sun Pharmaceutical',        price:1682.40, chg:+0.55, sector:'Healthcare', regime:1 as RegimeId },
  { ticker:'DRREDDY.NS',    name:"Dr. Reddy's Laboratories",  price:5842.15, chg:-0.28, sector:'Healthcare', regime:0 as RegimeId },
]
