'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { getSchedule } from '@/lib/api'
import { REGIME_NAMES, REGIME_COLORS } from '@/types'
import { fmtINR, cn } from '@/lib/utils'

const REGIME_TAG_CLASS = ['tag-green','tag-yellow','tag-peach','tag-red']

export default function SchedulePage() {
  const router = useRouter()
  const { executionId, scheduleData, setScheduleData, executionResult, backendOnline } = useStore()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'time'|'pov'>('time')

  useEffect(() => {
    if (!executionResult) { router.replace('/configure'); return }
    if (scheduleData || !executionId || !backendOnline) return
    setLoading(true)
    getSchedule(executionId).then(setScheduleData).catch(console.warn).finally(() => setLoading(false))
  }, [executionId, scheduleData, executionResult, backendOnline])

  const sessions = scheduleData?.sessions ?? []
  const profile  = scheduleData?.intraday_profile

  // Intraday chart data
  const intradayData = profile
    ? profile.slots.map((s,i) => ({ slot:s, vol: profile.relative_volume[i] }))
    : []

  // Session table data
  const tableData = sessions.length > 0 ? sessions : (executionResult ? (() => {
    const acS = executionResult.ac_summary.schedule
    const rlS = executionResult.rl_summary.schedule
    return acS.slice(0,8).map((n,j) => ({
      session_id: j, label:`Day ${Math.floor(j/2)+1} ${j%2===0?'Morning':'Afternoon'}`,
      day:Math.floor(j/2)+1, time_window_ist:j%2===0?'09:15–12:00':'12:00–15:30',
      ac_shares:Math.round(n), rl_shares:Math.round(rlS[j]||0),
      diff:Math.round((rlS[j]||0)-n), impact_per_share_inr:0.0008,
      regime:1 as const, regime_name:REGIME_NAMES[1],
      ac_cumulative:acS.slice(0,j+1).reduce((a,b)=>a+b,0),
      ac_cost_cumulative: acS.slice(0,j+1).reduce((a,b)=>a+b,0)*0.0002,
    }))
  })() : [])

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Execution Schedule</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">
              Interval-by-interval breakdown · {executionResult?.ticker}
            </p>
          </div>
        </div>
        <div className="disclaimer">⚠ Prices delayed 15 minutes. Production deployment uses Upstox API or Angel One SmartAPI.</div>

        {/* Intraday liquidity curve */}
        <div className="card mb-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1">
              Intraday Liquidity Profile — Average Volume by 15-min Interval
            </h3>
            <div className="flex gap-2">
              <span className="tag tag-blue">── Avg Volume</span>
              <span className="tag tag-mauve">── RL Schedule</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={intradayData} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.4)" />
              <XAxis dataKey="slot" tick={{fill:'#9399b2',fontSize:10}} interval={2} angle={-30} textAnchor="end" height={40} />
              <YAxis tick={{fill:'#9399b2',fontSize:11}} />
              <Tooltip contentStyle={{background:'#181825',border:'1px solid #45475a',borderRadius:8}} />
              <Bar dataKey="vol" name="Avg Volume" fill="rgba(137,180,250,0.25)" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-3 text-[11px] text-overlay1">
            <span>▲ Morning surge window (9:15–10:00)</span>
            <span>▽ Afternoon lull (12:00–14:00)</span>
            <span>▲ Closing auction window (15:00–15:30)</span>
          </div>
        </div>

        {/* Table header + toggle */}
        <div className="flex justify-between items-center mb-3">
          <p className="section-label mb-0">Session-by-Session Schedule</p>
          <div className="flex gap-2">
            <button onClick={()=>setMode('time')} className={cn('btn text-[11px] py-1.5 px-3.5', mode==='time'?'btn-primary':'btn-ghost')}>Time-Based</button>
            <button onClick={()=>setMode('pov')}  className={cn('btn text-[11px] py-1.5 px-3.5', mode==='pov' ?'btn-primary':'btn-ghost')}>POV / Volume %</button>
          </div>
        </div>

        <div className="card overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-overlay1 text-sm">
              <span className="spinner" /> Loading schedule…
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {['Session','Time (IST)','AC Schedule','RL Schedule','Δ','Impact (₹/sh)','Regime','Cumul. Sold','Cumul. Cost']
                    .map(h=>(
                      <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-overlay1 uppercase tracking-wide border-b border-surface0 font-medium whitespace-nowrap">{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((s, i) => (
                  <motion.tr key={s.session_id}
                    className="hover:bg-surface0 transition-colors"
                    initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}>
                    <td className="px-3.5 py-2.5 text-text font-medium border-b border-surface0 whitespace-nowrap">{s.label}</td>
                    <td className="px-3.5 py-2.5 text-subtext1 border-b border-surface0">{s.time_window_ist}</td>
                    <td className="px-3.5 py-2.5 text-subtext1 border-b border-surface0">{Math.round(s.ac_shares).toLocaleString('en-IN')}</td>
                    <td className="px-3.5 py-2.5 text-mauve font-medium border-b border-surface0">{Math.round(s.rl_shares).toLocaleString('en-IN')}</td>
                    <td className={cn('px-3.5 py-2.5 border-b border-surface0', s.diff<0?'text-red':'text-green')}>
                      {(s.diff>=0?'+':'')+Math.round(s.diff).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3.5 py-2.5 text-subtext1 border-b border-surface0">₹{s.impact_per_share_inr.toFixed(4)}</td>
                    <td className="px-3.5 py-2.5 border-b border-surface0">
                      <span className={`tag ${REGIME_TAG_CLASS[s.regime]}`}>R{s.regime} {['Trending','Mean-Rev','High Vol','Crisis'][s.regime]}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-subtext1 border-b border-surface0">{Math.round(s.ac_cumulative).toLocaleString('en-IN')}</td>
                    <td className="px-3.5 py-2.5 text-subtext1 border-b border-surface0 last:border-b-0">{fmtINR(s.ac_cost_cumulative)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  )
}
