'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { getStockRegime } from '@/lib/api'
import { REGIME_NAMES, REGIME_ACTIONS, REGIME_COLORS, type RegimeId } from '@/types'
import { cn } from '@/lib/utils'

const REGIME_ICONS = ['🟢','🟡','🟠','🔴']
const FEAT_COLORS  = ['#cba6f7','#89b4fa','#74c7ec','#94e2d5']

export default function RegimePage() {
  const router = useRouter()
  const { executionResult, selectedStock, regimeData, setRegimeData, backendOnline } = useStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!executionResult && !selectedStock) { router.replace('/configure'); return }
    if (regimeData) return
    // Try embedded regime from executionResult first
    const embedded = executionResult?.regime_full
    if (embedded && Object.keys(embedded).length) { setRegimeData(embedded); return }
    const ticker = selectedStock?.ticker || executionResult?.ticker
    if (!ticker || !backendOnline) return
    setLoading(true)
    getStockRegime(ticker).then(setRegimeData).catch(console.warn).finally(() => setLoading(false))
  }, [executionResult, selectedStock, regimeData, backendOnline])

  const regime   = (regimeData?.current_regime ?? executionResult?.current_regime ?? 1) as RegimeId
  const trans    = regimeData?.transition_matrix ?? [[.85,.10,.04,.01],[.10,.75,.12,.03],[.05,.30,.55,.10],[.02,.15,.40,.43]]
  const featImp  = regimeData?.feature_importance ?? { 'India VIX Proxy':38,'Realised Volatility':29,'Price Momentum':21,'Volume Deviation':12 }
  const ph       = regimeData?.price_history
  const rh       = regimeData?.regime_history

  // Chart data: price + regime
  const priceChartData = ph
    ? ph.dates.map((d,i) => ({ date:d, price:ph.prices[i], regime: rh?.[i]??1 }))
    : Array.from({length:120},(_,i) => ({
        date: new Date(Date.now()-((120-i)*86400000)).toLocaleDateString('en-IN',{month:'short',day:'numeric'}),
        price: Math.round(2300+i*1.5+Math.sin(i/10)*40),
        regime: i<25?0:i<55?1:i<75?2:i<82?3:1,
      }))

  const regimeLabels = ['R0: Low Vol ↑','R1: Mean Rev','R2: High Vol ↓','R3: Crisis']
  const transColors  = ['rgba(166,227,161,','rgba(249,226,175,','rgba(250,179,135,','rgba(243,139,168,']

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Regime Monitor</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">Hidden Markov Model · 4-state Gaussian HMM</p>
          </div>
        </div>
        <div className="disclaimer">⚠ Prices delayed 15 minutes. Production deployment uses Upstox API or Angel One SmartAPI.</div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-overlay1 text-sm">
            <span className="spinner" /> Running HMM regime analysis…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 mb-5">
              {/* Current regime big badge */}
              <div>
                <p className="section-label">Current Market Regime</p>
                <motion.div
                  className={cn('card border mb-4', `regime-${regime}`)}
                  style={{ borderColor: REGIME_COLORS[regime]+'50', background: REGIME_COLORS[regime]+'10' }}
                  initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}}
                >
                  <div className="text-5xl mb-3 text-center">{REGIME_ICONS[regime]}</div>
                  <div className="font-syne font-extrabold text-xl text-center mb-2"
                       style={{color:REGIME_COLORS[regime]}}>
                    Regime {regime} — {REGIME_NAMES[regime]}
                  </div>
                  <div className="text-[13px] text-subtext1 text-center">{REGIME_ACTIONS[regime]}</div>
                  <div className="flex justify-center gap-5 mt-4 text-[11px] text-overlay1">
                    <span>India VIX: <strong className="text-text">{selectedStock?.india_vix ?? '15.2'}</strong></span>
                    <span>·</span>
                    <span>Realised Vol: <strong className="text-text">{selectedStock?.realised_vol_30d_pct ?? '18.4'}%</strong></span>
                  </div>
                </motion.div>

                {/* Feature importance */}
                <p className="section-label">Feature Importance</p>
                <div className="card">
                  {Object.entries(featImp).map(([name,pct],i) => (
                    <div key={name} className="mb-3 last:mb-0">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-subtext0">{name}</span>
                        <span style={{color:FEAT_COLORS[i]}}>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-surface0 rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full"
                          style={{background:FEAT_COLORS[i]}}
                          initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:.8,delay:i*.1}} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transition matrix */}
              <div>
                <p className="section-label">HMM Transition Matrix (P(tomorrow | today))</p>
                <div className="card mb-4 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-[9px] text-overlay1 font-medium" />
                        {regimeLabels.map(l=>(
                          <th key={l} className="p-2 text-[9px] text-overlay1 font-medium uppercase tracking-wide">{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trans.map((row,i) => (
                        <tr key={i}>
                          <td className="p-2 text-[10px] text-subtext0 whitespace-nowrap">{regimeLabels[i]}</td>
                          {row.map((val,j) => {
                            const isMax = row.indexOf(Math.max(...row)) === j
                            return (
                              <td key={j} className="p-1.5 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-10 rounded-md text-[11px] transition-transform hover:scale-110"
                                     style={{background:`${transColors[j]}${(val*0.8).toFixed(2)})`, fontWeight: isMax?700:400, color:'#cdd6f4'}}>
                                  {(val*100).toFixed(0)}%
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Regime-adjusted schedule preview */}
                <p className="section-label">Regime-Adjusted Schedule Preview</p>
                <div className="card">
                  <p className="text-[12px] text-subtext1 leading-relaxed mb-3">
                    If market transitions to <strong className="text-red">Regime 3</strong> tomorrow,
                    the RL agent will reduce Day 3 execution from{' '}
                    <strong className="text-text">50,000</strong> to{' '}
                    <strong className="text-red">15,000</strong> shares and redistribute to Days 7–10.
                  </p>
                  <div className="metric-row"><span className="metric-label">Current Day 3 target</span><span className="metric-val">50,000 shares</span></div>
                  <div className="metric-row"><span className="metric-label">Regime 3 adjusted</span><span className="metric-val text-red">15,000 shares (−70%)</span></div>
                  <div className="metric-row"><span className="metric-label">Redistributed to</span><span className="metric-val">Days 7–10 (+8,750/day)</span></div>
                  <div className="metric-row"><span className="metric-label">Expected cost delta</span><span className="metric-val text-yellow">+₹1.2L (insurance cost)</span></div>
                </div>
              </div>
            </div>

            {/* Regime history chart */}
            <p className="section-label">Regime History — {executionResult?.ticker || selectedStock?.ticker} (Last 6 Months)</p>
            <div className="card">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={priceChartData} margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.4)" />
                  <XAxis dataKey="date" tick={{fill:'#9399b2',fontSize:10}} interval={14} />
                  <YAxis tick={{fill:'#9399b2',fontSize:11}} tickFormatter={v=>`₹${v}`} />
                  <Tooltip
                    contentStyle={{background:'#181825',border:'1px solid #45475a',borderRadius:8}}
                    formatter={(v:any,name:string) => name==='price' ? [`₹${v}`,name] : [v,name]}
                  />
                  <Line type="monotone" dataKey="price" name="price"
                    stroke="#89b4fa" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3 text-[11px]">
                {[0,1,2,3].map(r=>(
                  <span key={r} style={{color:REGIME_COLORS[r as RegimeId]}}>
                    ■ Regime {r}: {REGIME_NAMES[r as RegimeId].split(' — ')[0]}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
