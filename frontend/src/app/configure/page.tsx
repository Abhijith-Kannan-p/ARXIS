'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { searchStocks, getStockProfile, generateStrategy } from '@/lib/api'
import { NSE_UNIVERSE, REGIME_NAMES, REGIME_COLORS, type RegimeId } from '@/types'
import { fmtINR, fmtShares, interpolateRiskColor, advImpactColor, cn } from '@/lib/utils'
import type { StockSearchResult, StockProfile } from '@/types'

const SECTORS = Array.from(new Set(NSE_UNIVERSE.map(s => s.sector)))

const STEPS_LABELS = [
  'Fetching live market data…',
  'Training HMM regime detector…',
  'Solving Almgren-Chriss trajectory…',
  'Running QR-DQN RL agent…',
  'Running Monte Carlo simulation…',
]

export default function ConfigurePage() {
  const router = useRouter()
  const {
    selectedStock, setSelectedStock,
    setExecutionResult, setCurrentRegime,
    resetExecution, backendOnline,
  } = useStore()

  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<StockSearchResult[]>([])
  const [showDrop, setShowDrop]       = useState(false)
  const [shares, setShares]           = useState(500000)
  const [horizon, setHorizon]         = useState(15)
  const [riskVal, setRiskVal]         = useState(50)
  const [generating, setGenerating]   = useState(false)
  const [genStep, setGenStep]         = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // ── Search ───────────────────────────────────────────────────
  const handleSearch = useCallback(async (val: string) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val) { setShowDrop(false); return }

    // Instant local filter
    const local = NSE_UNIVERSE.filter(s =>
      s.ticker.toLowerCase().includes(val.toLowerCase()) ||
      s.name.toLowerCase().includes(val.toLowerCase())
    ).map(s => ({ ticker: s.ticker, name: s.name, sector: s.sector,
      price_inr: s.price, change_pct: s.chg, avg_daily_volume: 0 }))
    setResults(local); setShowDrop(true)

    if (!backendOnline) return
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchStocks(val)
        if (res.length) { setResults(res); setShowDrop(true) }
      } catch {}
    }, 300)
  }, [backendOnline])

  // ── Select stock ─────────────────────────────────────────────
  const handleSelect = useCallback(async (ticker: string) => {
    setShowDrop(false)
    setQuery(ticker)
    const local = NSE_UNIVERSE.find(s => s.ticker === ticker)
    if (local) {
      const fallback: StockProfile = {
        ticker: local.ticker, name: local.name, sector: local.sector,
        price_inr: local.price, change_pct: local.chg,
        avg_daily_volume: 5e6, realised_vol_30d_pct: 20,
        market_cap_cr: null,
        circuit_limits: { upper_circuit_inr: local.price*1.2, lower_circuit_inr: local.price*0.8, upper_pct:20, lower_pct:-20 },
        india_vix: 15.0, current_regime: local.regime,
        regime_meta: { name: REGIME_NAMES[local.regime], action:'', color:'yellow', execution_multiplier:1 },
        data_delay_note: 'Delayed ~15 min',
      }
      setSelectedStock(fallback)
      setCurrentRegime(local.regime)
    }
    if (!backendOnline) return
    try {
      const profile = await getStockProfile(ticker)
      setSelectedStock(profile)
      setCurrentRegime(profile.current_regime)
    } catch {}
  }, [backendOnline, setSelectedStock, setCurrentRegime])

  // ── Generate ─────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!selectedStock) return
    setGenerating(true)
    resetExecution()

    if (!backendOnline) {
      let i = 0
      const t = setInterval(() => { setGenStep(STEPS_LABELS[i++] || ''); if (i >= STEPS_LABELS.length) clearInterval(t) }, 600)
      setTimeout(() => { setGenerating(false); router.push('/overview') }, 1400)
      return
    }

    let stepIdx = 0
    const stepTimer = setInterval(() => {
      setGenStep(STEPS_LABELS[Math.min(stepIdx++, STEPS_LABELS.length-1)])
    }, 1800)

    try {
      const result = await generateStrategy({
        ticker: selectedStock.ticker,
        shares, horizon_days: horizon,
        risk_preference: riskVal / 100,
      })
      setExecutionResult(result)
      setCurrentRegime(result.current_regime)
      router.push('/overview')
    } catch (e: any) {
      alert(`Generation failed: ${e.message}`)
    } finally {
      clearInterval(stepTimer)
      setGenerating(false)
      setGenStep('')
    }
  }, [selectedStock, shares, horizon, riskVal, backendOnline, resetExecution, setExecutionResult, setCurrentRegime, router])

  // ── Risk color ───────────────────────────────────────────────
  const riskColor = interpolateRiskColor(riskVal)
  const riskLabel = ['Aggressive — Minimize Cost','Moderate-Aggressive','Balanced','Moderate-Conservative','Conservative — Minimize Risk'][Math.min(Math.floor(riskVal/25),4)]

  // ── INR value ────────────────────────────────────────────────
  const price = selectedStock?.price_inr ?? 2489
  const inrVal = fmtINR(shares * price)

  // ── ADV impact ───────────────────────────────────────────────
  const adv = selectedStock?.avg_daily_volume ?? 5e6
  const advPct = adv > 0 ? (shares/adv*100) : 0
  const advColor = advImpactColor(advPct)

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Configure Execution</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">Set up your institutional execution problem</p>
          </div>
        </div>
        <div className="disclaimer">⚠ Prices delayed 15 minutes. Production deployment uses Upstox API or Angel One SmartAPI.</div>

        <div className="grid grid-cols-2 gap-5 items-start">
          {/* ── LEFT COLUMN ──────────────────────── */}
          <div>
            {/* Stock search */}
            <p className="section-label">Stock Selection</p>
            <div className="card mb-5">
              <div className="mb-4">
                <p className="text-[11px] text-overlay1 uppercase tracking-wide mb-1.5">Search NSE Stock</p>
                <div className="relative">
                  <input
                    value={query}
                    onChange={e => handleSearch(e.target.value)}
                    onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                    className="input-field"
                    placeholder="Search by name or ticker…"
                    autoComplete="off"
                  />
                  <AnimatePresence>
                    {showDrop && results.length > 0 && (
                      <motion.div
                        initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                        className="absolute top-full left-0 right-0 z-50 bg-surface0 border
                                   border-surface1 rounded-[10px] mt-1 overflow-hidden"
                      >
                        {results.map(s => (
                          <button key={s.ticker} onMouseDown={() => handleSelect(s.ticker)}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between
                                       hover:bg-surface1 transition-colors text-left">
                            <div>
                              <div className="text-xs font-semibold text-mauve">{s.ticker}</div>
                              <div className="text-[11px] text-subtext0">{s.name}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-text">₹{(s.price_inr||0).toLocaleString('en-IN')}</div>
                              <div className={cn('text-[11px]', (s.change_pct||0)>=0?'text-green':'text-red')}>
                                {(s.change_pct||0)>=0?'▲':'▼'} {Math.abs(s.change_pct||0).toFixed(2)}%
                              </div>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              {selectedStock && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      <span className="font-semibold text-mauve text-base">{selectedStock.ticker}</span>
                      <span className="text-[12px] text-subtext0 ml-2">{selectedStock.name}</span>
                    </div>
                    <span className="font-syne font-bold text-lg text-text">
                      ₹{selectedStock.price_inr.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="text-[11px] text-overlay1 mt-1">
                    {selectedStock.sector} · {selectedStock.avg_daily_volume ? Math.round(selectedStock.avg_daily_volume).toLocaleString('en-IN')+' avg vol' : ''}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Liquidity panel */}
            <p className="section-label">Liquidity Profile</p>
            <div className="card mb-5">
              {!selectedStock ? (
                <p className="text-[12px] text-overlay1 text-center py-5">Select a stock to view liquidity stats</p>
              ) : (
                <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                  <div className="metric-row"><span className="metric-label">Current Price (delayed 15m)</span><span className="metric-val">₹{selectedStock.price_inr.toLocaleString('en-IN')}</span></div>
                  <div className="metric-row"><span className="metric-label">Avg Daily Volume</span><span className="metric-val">{Math.round(selectedStock.avg_daily_volume).toLocaleString('en-IN')}</span></div>
                  <div className="metric-row"><span className="metric-label">30d Realised Volatility</span><span className="metric-val">{selectedStock.realised_vol_30d_pct}%</span></div>
                  <div className="metric-row">
                    <span className="metric-label">Order as % of ADV</span>
                    <span className="font-semibold text-[12px]" style={{color:advColor}}>
                      {advPct.toFixed(2)}% — {advPct<1?'Low':advPct<5?'Moderate':'High Impact'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface0 rounded-full overflow-hidden my-3">
                    <motion.div className="h-full rounded-full" style={{background:advColor}}
                      initial={{width:0}} animate={{width:`${Math.min(advPct*10,100)}%`}} transition={{duration:.5}} />
                  </div>
                  <div className="metric-row"><span className="metric-label">Circuit Limit Upper</span><span className="metric-val text-green">₹{selectedStock.circuit_limits.upper_circuit_inr.toFixed(2)}</span></div>
                  <div className="metric-row"><span className="metric-label">Circuit Limit Lower</span><span className="metric-val text-red">₹{selectedStock.circuit_limits.lower_circuit_inr.toFixed(2)}</span></div>
                  <div className="metric-row"><span className="metric-label">India VIX</span><span className="metric-val">{selectedStock.india_vix}</span></div>
                  <div className="mt-3">
                    <span className={cn('regime-badge', `regime-${selectedStock.current_regime}`)}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      Regime {selectedStock.current_regime} — {REGIME_NAMES[selectedStock.current_regime]}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Universe grid */}
            <p className="section-label">Nifty 50 Universe — 14 Stocks</p>
            <div className="card p-4">
              {SECTORS.map(sector => (
                <div key={sector}>
                  <p className="text-[9px] uppercase tracking-[2px] text-overlay0 mt-2.5 mb-1.5 first:mt-0">{sector}</p>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {NSE_UNIVERSE.filter(s=>s.sector===sector).map(s => (
                      <button key={s.ticker}
                        onClick={() => handleSelect(s.ticker)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                          'border text-[11px] font-mono transition-all duration-150',
                          selectedStock?.ticker===s.ticker
                            ? 'bg-mauve/10 border-mauve text-mauve'
                            : 'bg-surface0 border-surface1 text-subtext1 hover:bg-surface1 hover:border-overlay0'
                        )}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{background:REGIME_COLORS[s.regime]}} />
                        <span className="font-semibold">{s.ticker.replace('.NS','')}</span>
                        <span className={s.chg>=0?'text-green text-[9px]':'text-red text-[9px]'}>
                          {s.chg>=0?'▲':'▼'}{Math.abs(s.chg).toFixed(2)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT COLUMN ─────────────────────── */}
          <div>
            <p className="section-label">Execution Parameters</p>
            <div className="card mb-5">
              {/* Shares */}
              <div className="mb-5">
                <p className="text-[11px] text-overlay1 uppercase tracking-wide mb-1.5">Shares to Sell</p>
                <input type="number" value={shares} min={1000}
                  onChange={e => setShares(Number(e.target.value))}
                  className="input-field" />
                <p className="text-[11px] text-mauve mt-1.5">≈ {inrVal} at current price</p>
              </div>

              {/* Horizon */}
              <div className="mb-5">
                <p className="text-[11px] text-overlay1 uppercase tracking-wide mb-1.5">
                  Time Horizon: <span className="text-mauve">{horizon} trading days</span>
                </p>
                <input type="range" min={1} max={60} value={horizon}
                  onChange={e => setHorizon(Number(e.target.value))}
                  style={{background:`linear-gradient(to right,#cba6f7 0%,#cba6f7 ${(horizon/60)*100}%,#45475a ${(horizon/60)*100}%,#45475a 100%)`}}
                />
                <div className="flex justify-between text-[10px] text-overlay0 mt-1">
                  <span>1 day (aggressive)</span><span>60 days (ultra-passive)</span>
                </div>
              </div>

              {/* Risk */}
              <div>
                <p className="text-[11px] uppercase tracking-wide mb-1.5">
                  Risk Preference: <span style={{color:riskColor}}>{riskLabel}</span>
                </p>
                <input type="range" min={0} max={100} value={riskVal}
                  onChange={e => setRiskVal(Number(e.target.value))}
                  style={{background:`linear-gradient(to right,${riskColor} 0%,${riskColor} ${riskVal}%,#45475a ${riskVal}%,#45475a 100%)`}}
                />
                <div className="flex justify-between text-[10px] mt-1">
                  <span className="text-green">← Minimize Cost</span>
                  <span className="text-red">Minimize Risk →</span>
                </div>
              </div>
            </div>

            {/* Execution engine */}
            <p className="section-label">Execution Engine</p>
            <div className="card mb-5 bg-mauve/[0.03] border-mauve/25">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-mauve shadow-[0_0_8px_rgba(203,166,247,.6)]" />
                <span className="font-syne font-bold text-sm text-text">ARXIS Unified Engine</span>
                <span className="tag tag-mauve ml-auto">Always Active</span>
              </div>
              {[
                { icon:'◈', color:'text-green', label:'HMM Regime Detection' },
                { icon:'◉', color:'text-blue',  label:'QR-DQN RL Agent' },
                { icon:'∑', color:'text-teal',  label:'Almgren-Chriss Benchmark' },
              ].map(item => (
                <div key={item.label}
                     className="flex items-center gap-2.5 px-2.5 py-2 bg-surface0 rounded-lg mb-2 last:mb-0">
                  <span className={cn('text-[13px]', item.color)}>{item.icon}</span>
                  <span className="text-[12px] text-subtext1">{item.label}</span>
                  <span className="ml-auto text-[10px] text-green">● running</span>
                </div>
              ))}
              <p className="text-[10px] text-overlay0 mt-3 pt-3 border-t border-surface0 leading-relaxed">
                All three components run together on every execution. AC is shown as a benchmark so you see the exact improvement the regime-aware agent delivers.
              </p>
            </div>

            {/* Generate button */}
            <motion.button
              onClick={handleGenerate}
              disabled={!selectedStock || generating}
              className={cn(
                'w-full py-4 rounded-xl font-syne font-bold text-sm text-crust',
                'bg-gradient-to-r from-mauve to-blue relative overflow-hidden',
                'transition-all duration-300',
                selectedStock && !generating
                  ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(203,166,247,.3)] cursor-pointer'
                  : 'opacity-60 cursor-not-allowed',
              )}
              whileTap={selectedStock && !generating ? { scale: 0.98 } : {}}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner border-crust border-t-transparent" />
                  {genStep || 'Initialising…'}
                </span>
              ) : '⚡ Generate Execution Strategy'}
            </motion.button>
            {!selectedStock && (
              <p className="text-[11px] text-overlay1 text-center mt-2">Select a stock to continue</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
