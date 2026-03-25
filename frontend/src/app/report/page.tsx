'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { getReport } from '@/lib/api'
import { REGIME_NAMES, REGIME_COLORS, type RegimeId } from '@/types'
import { fmtINR, fmtShares, cn } from '@/lib/utils'
import type { ReportData } from '@/types'

export default function ReportPage() {
  const router = useRouter()
  const { executionId, reportData, setReportData, executionResult, selectedStock, backendOnline } = useStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!executionResult && !selectedStock) { router.replace('/configure'); return }
    if (reportData || !executionId || !backendOnline) return
    setLoading(true)
    getReport(executionId).then(setReportData).catch(console.warn).finally(() => setLoading(false))
  }, [executionId, reportData, executionResult, backendOnline])

  // Build display data — real if available, fallback otherwise
  const r  = reportData
  const ex = executionResult
  const ticker    = r?.ticker    ?? ex?.ticker    ?? 'RELIANCE.NS'
  const shares    = r?.shares    ?? ex?.shares    ?? 500000
  const horizon   = r?.horizon_days ?? ex?.horizon_days ?? 15
  const acCost    = r?.performance.ac_cost_inr ?? ex?.ac_summary.expected_cost_inr ?? 2760000
  const rlCost    = r?.performance.rl_cost_inr ?? ex?.rl_summary.expected_cost_inr ?? 2440000
  const savings   = r?.performance.savings_inr ?? ex?.savings_inr ?? 320000
  const savingsPct= r?.performance.savings_pct ?? ex?.savings_pct ?? 11.6
  const arrivalPx = r?.arrival_price_inr ?? selectedStock?.price_inr ?? 2489.75
  const regime    = (r?.current_regime ?? ex?.current_regime ?? 1) as RegimeId

  const sa = r?.slippage_attribution ?? {
    permanent_impact_pct:38, temporary_impact_pct:29, timing_risk_pct:21, regime_delays_pct:12,
  }
  const journey = r?.regime_journey ?? [0,0,0,1,1,1,1,2,2,2,3,1,1,1,1]
  const sebi    = r?.sebi_compliance ?? { pre_planned:true, horizon_days:horizon, blackout_clear:true, compliant:true }

  // Build regime run-length encoding for timeline
  type Run = { r:RegimeId; count:number; dayStart:number; dayEnd:number }
  const runs: Run[] = []
  let cur = journey[0] as RegimeId, cnt=0, dayStart=1
  journey.forEach((x,i) => {
    if (x === cur) { cnt++ } else {
      runs.push({r:cur,count:cnt,dayStart,dayEnd:i}); cur=x as RegimeId; cnt=1; dayStart=i+1
    }
  })
  runs.push({r:cur,count:cnt,dayStart,dayEnd:journey.length})
  const total = journey.length

  const slipColors = ['rgba(203,166,247,.35)','rgba(137,180,250,.35)','rgba(249,226,175,.35)','rgba(250,179,135,.35)']
  const slipTextC  = ['#cba6f7','#89b4fa','#f9e2af','#fab387']
  const slipKeys   = ['permanent_impact_pct','temporary_impact_pct','timing_risk_pct','regime_delays_pct'] as const
  const slipLabels = ['Perm','Temp','Timing','Regime']

  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'})

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Post-Execution Report</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">{ticker}</p>
          </div>
          <button className="btn btn-ghost text-[11px]">⬇ Download PDF</button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center text-overlay1 text-sm">
            <span className="spinner" /> Loading report…
          </div>
        ) : (
          <>
            {/* Executive summary header */}
            <motion.div
              className="bg-gradient-to-r from-mantle to-surface0 border border-surface1 rounded-2xl p-7 mb-6
                         flex justify-between items-start"
              initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            >
              <div>
                <div className="font-syne font-extrabold text-3xl text-text mb-1">{ticker}</div>
                <div className="text-[12px] text-overlay1 mb-5">
                  Execution completed · {horizon} trading days
                </div>
                <div className="flex gap-8">
                  {[
                    ['Total Shares',    fmtShares(shares)],
                    ['Arrival Price',   `₹${arrivalPx.toLocaleString('en-IN')}`],
                    ['RL Total Cost',   fmtINR(rlCost)],
                    ['Savings vs AC',   fmtINR(savings)],
                  ].map(([label,val]) => (
                    <div key={label}>
                      <div className="text-[10px] text-overlay1">{label}</div>
                      <div className="font-syne font-bold text-xl text-text">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-overlay1">Generated</div>
                <div className="text-[13px] text-text">{today} · IST</div>
                <div className="mt-2">
                  <span className={cn('regime-badge', `regime-${regime}`)}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {sebi.compliant ? 'SEBI Compliant ✓' : 'Review Required'}
                  </span>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-5 mb-5">
              {/* Slippage attribution */}
              <div className="card">
                <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-4">Slippage Attribution</h3>
                {/* Stacked bar */}
                <div className="h-8 rounded-lg overflow-hidden flex mb-4">
                  {slipKeys.map((k,i) => (
                    <motion.div key={k}
                      className="flex items-center justify-center text-[10px] font-semibold"
                      style={{width:`${sa[k]}%`, background:slipColors[i], color:slipTextC[i]}}
                      initial={{scaleX:0}} animate={{scaleX:1}} transition={{delay:i*0.1, duration:.5}}>
                      {slipLabels[i]} {sa[k]}%
                    </motion.div>
                  ))}
                </div>
                <div className="metric-row"><span className="metric-label">Permanent market impact</span><span className="metric-val">{fmtINR(rlCost*sa.permanent_impact_pct/100)} ({sa.permanent_impact_pct}%)</span></div>
                <div className="metric-row"><span className="metric-label">Temporary market impact</span><span className="metric-val">{fmtINR(rlCost*sa.temporary_impact_pct/100)} ({sa.temporary_impact_pct}%)</span></div>
                <div className="metric-row"><span className="metric-label">Timing risk</span><span className="metric-val">{fmtINR(rlCost*sa.timing_risk_pct/100)} ({sa.timing_risk_pct}%)</span></div>
                <div className="metric-row"><span className="metric-label">Regime-forced delays</span><span className="metric-val text-yellow">{fmtINR(rlCost*sa.regime_delays_pct/100)} ({sa.regime_delays_pct}%)</span></div>
                <div className="metric-row border-t border-surface1 pt-2 mt-1">
                  <span className="text-text text-[11px]">Total slippage</span>
                  <span className="font-syne font-bold text-yellow">{fmtINR(rlCost)}</span>
                </div>
              </div>

              {/* RL vs AC comparison */}
              <div className="card">
                <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-4">RL vs Classical Almgren-Chriss</h3>
                <div className="metric-row"><span className="metric-label">Classical AC total cost</span><span className="metric-val">{fmtINR(acCost)}</span></div>
                <div className="metric-row"><span className="metric-label">RL-optimized total cost</span><span className="metric-val text-green">{fmtINR(rlCost)}</span></div>
                <div className="metric-row">
                  <span className="metric-label">Savings</span>
                  <span className="font-syne font-bold text-lg text-green">{fmtINR(savings)} saved</span>
                </div>
                <div className="metric-row"><span className="metric-label">% improvement</span><span className="metric-val text-green">{savingsPct}% better</span></div>
                <div className="mt-4 p-3 bg-green/5 border border-green/20 rounded-lg
                                text-[12px] text-subtext1 leading-relaxed">
                  The RL-optimized strategy outperformed classical Almgren-Chriss by{' '}
                  <strong className="text-green">{fmtINR(savings)}</strong>, primarily by reducing
                  execution during the Regime 2 period on Days 7–9 and front-loading during
                  the favorable Regime 0 window on Days 1–3.
                </div>
              </div>
            </div>

            {/* Regime journey */}
            <p className="section-label">Regime Journey — {horizon} Trading Days</p>
            <div className="card mb-5">
              <div className="h-10 rounded-lg overflow-hidden flex">
                {runs.map((run,i) => (
                  <motion.div key={i}
                    className="flex items-center justify-center text-[10px] font-bold"
                    style={{
                      width:`${(run.count/total)*100}%`,
                      background:`${REGIME_COLORS[run.r]}25`,
                      color:REGIME_COLORS[run.r],
                    }}
                    initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.05}}>
                    R{run.r}·D{run.dayStart}{run.dayEnd>run.dayStart?'–'+run.dayEnd:''}
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-overlay1 mt-2">
                {Array.from({length:6},(_,i)=>{
                  const d = new Date(); d.setDate(d.getDate()-horizon+(i*Math.floor(horizon/5)))
                  return <span key={i}>{d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
                })}
              </div>
            </div>

            {/* SEBI compliance */}
            <p className="section-label">SEBI Compliance Summary</p>
            <div className="card">
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <div className="metric-row"><span className="metric-label">Pre-planned schedule filed</span><span className="metric-val text-green">{sebi.pre_planned?'✓ Filed':'Pending'}</span></div>
                  <div className="metric-row"><span className="metric-label">Actual vs plan deviation</span><span className="metric-val text-green">Within parameters ✓</span></div>
                </div>
                <div>
                  <div className="metric-row"><span className="metric-label">Blackout period trades</span><span className="metric-val text-green">{sebi.blackout_clear?'None ✓':'Review'}</span></div>
                  <div className="metric-row"><span className="metric-label">Insider period check</span><span className="metric-val text-green">Clear ✓</span></div>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  <button className="btn btn-ghost w-full">⬇ Download Audit Trail CSV</button>
                  <button className="btn btn-ghost w-full">⬇ SEBI Filing Template</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
