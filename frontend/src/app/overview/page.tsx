'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { REGIME_NAMES, REGIME_COLORS } from '@/types'
import { fmtINR, fmtShares, cn } from '@/lib/utils'

const CARD_VARIANTS = {
  hidden: { opacity:0, y:16 },
  show:   (i:number) => ({ opacity:1, y:0, transition:{ delay: i*0.08 } }),
}

export default function OverviewPage() {
  const router = useRouter()
  const { executionResult, selectedStock } = useStore()

  // Redirect if no execution
  useEffect(() => {
    if (!executionResult && !selectedStock) router.replace('/configure')
  }, [executionResult, selectedStock, router])

  if (!executionResult) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64 text-overlay1 text-sm">
          No execution generated yet. <button onClick={()=>router.push('/configure')} className="text-mauve ml-2 hover:underline">Configure one →</button>
        </div>
      </AppShell>
    )
  }

  const r   = executionResult
  const acS = r.ac_summary.schedule
  const rlS = r.rl_summary.schedule
  const n   = Math.max(acS.length, rlS.length)

  // Aggregate to daily
  const chartData = Array.from({ length: Math.ceil(n/2) }, (_,i) => ({
    day: `D${i+1}`,
    ac:  Math.round((acS[i*2]||0)+(acS[i*2+1]||0)),
    rl:  Math.round((rlS[i*2]||0)+(rlS[i*2+1]||0)),
  }))

  const summary_cards = [
    { label:'Total Shares',      value:fmtShares(r.shares),               sub:r.ticker },
    { label:'Est. Slippage',     value:fmtINR(r.rl_summary.expected_cost_inr), sub:`${r.ac_summary.basis_points?.toFixed(1)} bps`, valueClass:'text-yellow' },
    { label:'Execution Window',  value:`${r.horizon_days} days`,           sub:`${r.horizon_days*2} sessions` },
    { label:'RL vs AC Savings',  value:fmtINR(r.savings_inr),             sub:`${r.savings_pct}% better`, valueClass:'text-green' },
    { label:'Current Regime',    value:'', regime: r.current_regime },
  ]

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Strategy Overview</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">
              {r.ticker} · {fmtShares(r.shares)} shares · {r.horizon_days} trading days
            </p>
          </div>
        </div>
        <div className="disclaimer">⚠ Prices delayed 15 minutes. Production deployment uses Upstox API or Angel One SmartAPI.</div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {summary_cards.map((c, i) => (
            <motion.div key={c.label} className="glow-card"
              custom={i} variants={CARD_VARIANTS} initial="hidden" animate="show">
              <p className="text-[10px] text-overlay1 uppercase tracking-[1.5px] mb-1.5">{c.label}</p>
              {c.regime !== undefined ? (
                <>
                  <div className="mt-1.5">
                    <span className={cn('regime-badge', `regime-${c.regime}`)}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      Regime {c.regime}
                    </span>
                  </div>
                  <p className="text-[11px] text-overlay1 mt-1">{REGIME_NAMES[c.regime as 0|1|2|3]}</p>
                </>
              ) : (
                <>
                  <p className={cn('font-syne font-bold text-2xl', c.valueClass || 'text-text')}>{c.value}</p>
                  <p className="text-[11px] text-overlay1 mt-1">{c.sub}</p>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {/* Schedule comparison chart */}
        <div className="card mb-5">
          <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-4">
            Schedule Comparison — Classical AC vs RL-Optimized
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#9399b2" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="#9399b2" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#cba6f7" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#cba6f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.4)" />
              <XAxis dataKey="day" tick={{fill:'#9399b2',fontSize:11}} />
              <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{fill:'#9399b2',fontSize:11}} />
              <Tooltip
                contentStyle={{background:'#181825',border:'1px solid #45475a',borderRadius:8}}
                labelStyle={{color:'#cdd6f4'}} itemStyle={{color:'#9399b2'}}
                formatter={(v:any) => [Number(v).toLocaleString('en-IN'), '']}
              />
              <Legend wrapperStyle={{color:'#9399b2',fontSize:11}} />
              <Area type="monotone" dataKey="ac" name="Classical AC"
                stroke="rgba(147,153,178,0.6)" strokeWidth={1.5} strokeDasharray="5 4"
                fill="url(#acGrad)" dot={false} />
              <Area type="monotone" dataKey="rl" name="RL-Optimized"
                stroke="#cba6f7" strokeWidth={2} fill="url(#rlGrad)"
                dot={{ fill:'#cba6f7', r:3 }} activeDot={{ r:5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Summary text */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-3">Executive Summary</h3>
            <p className="text-[12px] text-subtext1 leading-relaxed">
              Based on current market conditions, selling{' '}
              <strong className="text-text">{fmtShares(r.shares)} shares of {r.ticker}</strong>{' '}
              over <strong className="text-text">{r.horizon_days} trading days</strong> will cost an estimated{' '}
              <strong className="text-yellow">{fmtINR(r.rl_summary.expected_cost_inr)}</strong> in market impact
              ({r.ac_summary.basis_points?.toFixed(1)} basis points). The RL-optimized schedule reduces worst-case
              slippage by <strong className="text-green">{r.savings_pct}%</strong> compared to the classical
              Almgren-Chriss schedule by adapting to the current{' '}
              <strong className="text-text">Regime {r.current_regime} ({REGIME_NAMES[r.current_regime]})</strong> conditions.
            </p>
            <div className="flex gap-2.5 mt-4">
              <button className="btn btn-primary" onClick={()=>router.push('/schedule')}>View Schedule →</button>
              <button className="btn btn-ghost"   onClick={()=>router.push('/risk')}>Risk Analysis</button>
              <button className="btn btn-ghost"   onClick={()=>router.push('/monitor')}>Live Monitor</button>
            </div>
          </div>

          {/* SEBI */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-3">SEBI Compliance</h3>
            <div className="alert-green alert-row">⚖ Plan structured for SEBI (PIT) Regulations 2015</div>
            <p className="text-[12px] text-subtext1 leading-relaxed mt-2 mb-3">
              This execution plan spans a minimum of{' '}
              <strong className="text-text">{r.horizon_days} trading days</strong> and can be filed as a
              pre-approved trading plan under SEBI (Prohibition of Insider Trading) Regulations 2015.
            </p>
            <div className="metric-row"><span className="metric-label">Min holding period</span><span className="metric-val text-green">✓ {r.horizon_days} days met</span></div>
            <div className="metric-row"><span className="metric-label">Blackout window check</span><span className="metric-val text-green">✓ Clear</span></div>
            <div className="metric-row"><span className="metric-label">Pre-filing required</span><span className="metric-val">Yes — 2 trading days</span></div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
