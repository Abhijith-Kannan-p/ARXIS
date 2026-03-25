'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter } from 'recharts'
import AppShell from '@/components/layout/AppShell'
import { useStore } from '@/store/execution'
import { REGIME_NAMES, REGIME_COLORS, type RegimeId } from '@/types'
import { fmtINR, cn } from '@/lib/utils'

const LOG_SEED = [
  { time:'09:15', msg:'Session Day 3 started · Regime 1 confirmed', highlight:false },
  { time:'09:15', msg:'India VIX at 14.2 · Baseline parameters loaded', highlight:false },
  { time:'09:28', msg:'Volume surge detected', sub:'Increasing execution rate', highlight:true },
  { time:'09:30', msg:'Interval 09:30–09:45 started · Target: 45,000', highlight:false },
  { time:'09:32', msg:'Regime shift detected: 1 → 2', sub:'Adjusting schedule', highlight:true },
  { time:'09:34', msg:'REGIME 2 ACTIVE', sub:'Reducing interval target −30%', highlight:true },
]

function CircularProgress({ pct, color }: { pct: number; color: string }) {
  const r = 64, circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  return (
    <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full" style={{transform:'rotate(-90deg)'}}>
      <circle cx="80" cy="80" r={r} fill="none" stroke="#313244" strokeWidth="12" />
      <motion.circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={circ} strokeLinecap="round"
        initial={{strokeDashoffset: circ}} animate={{strokeDashoffset: offset}}
        transition={{duration:1.2, ease:'easeOut'}} />
    </svg>
  )
}

export default function MonitorPage() {
  const router  = useRouter()
  const { executionResult, selectedStock } = useStore()
  const [logs, setLogs] = useState(LOG_SEED.slice(0, 3))
  const [logIdx, setLogIdx] = useState(3)
  const timerRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!executionResult && !selectedStock) router.replace('/configure')
  }, [executionResult, selectedStock, router])

  // Simulate live log feed
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setLogIdx(i => {
        if (i >= LOG_SEED.length) { clearInterval(timerRef.current); return i }
        setLogs(prev => [LOG_SEED[i], ...prev].slice(0, 12))
        return i + 1
      })
    }, 2400)
    return () => clearInterval(timerRef.current)
  }, [])

  // Intraday price simulation
  const price0 = selectedStock?.price_inr ?? executionResult?.ac_summary?.schedule?.[0] ?? 2489
  const intradayData = Array.from({length:11}, (_,i) => {
    const h = 915 + i*15, hh = Math.floor(h/100), mm = h%100
    if (mm >= 60) return null
    const p = Number(price0) + Math.sin(i/3)*2 + Math.random()*1.5 - 0.75
    return {
      time: `${hh}:${mm.toString().padStart(2,'0')}`,
      price: +p.toFixed(2),
      exec:  Math.random() > 0.4 ? +p.toFixed(2) : undefined,
    }
  }).filter(Boolean) as {time:string;price:number;exec?:number}[]

  const progress   = 25
  const regime     = (executionResult?.current_regime ?? 1) as RegimeId
  const regimeColor= REGIME_COLORS[regime]

  return (
    <AppShell>
      <div className="px-8 py-7">
        <div className="flex items-center justify-between mb-7 pb-4 border-b border-surface0">
          <div>
            <h1 className="font-syne font-bold text-[22px] text-text">Live Execution Monitor</h1>
            <p className="text-[11px] text-overlay1 mt-0.5">
              Day 3 of {executionResult?.horizon_days ?? 15} · {executionResult?.ticker ?? selectedStock?.ticker} · 09:34 IST
            </p>
          </div>
        </div>
        <div className="disclaimer">⚠ Prices delayed 15 minutes. Production deployment uses Upstox API or Angel One SmartAPI.</div>

        <div className="grid grid-cols-3 gap-5 mb-5 items-start">
          {/* Progress ring */}
          <div className="card flex flex-col items-center py-6">
            <div className="relative w-40 h-40 flex items-center justify-center mb-4">
              <CircularProgress pct={progress} color={regimeColor} />
              <div className="text-center z-10">
                <div className="font-syne font-extrabold text-4xl" style={{color:regimeColor}}>{progress}%</div>
                <div className="text-[10px] text-overlay1">complete</div>
              </div>
            </div>
            <div className="text-[13px] text-text font-semibold">
              {(((executionResult?.shares??500000)*progress/100)).toLocaleString('en-IN')} / {(executionResult?.shares??500000).toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-overlay1 mb-4">shares sold</div>
            <div className="w-full">
              <div className="metric-row"><span className="metric-label">Day</span><span className="metric-val">3 of {executionResult?.horizon_days??15}</span></div>
              <div className="metric-row"><span className="metric-label">Impl. Shortfall</span><span className="metric-val text-yellow">₹6,240 (4.8 bps)</span></div>
              <div className="metric-row"><span className="metric-label">Status</span><span className="tag tag-yellow">On Track</span></div>
            </div>
          </div>

          {/* Current interval */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-4">Current Interval — 09:30–09:45 IST</h3>
            <div className="metric-row"><span className="metric-label">Target</span><span className="metric-val">45,000 shares</span></div>
            <div className="metric-row"><span className="metric-label">Executed</span><span className="metric-val text-green">28,000 shares</span></div>
            <div className="metric-row"><span className="metric-label">Remaining</span><span className="metric-val text-yellow">17,000 shares</span></div>
            <div className="metric-row"><span className="metric-label">Time remaining</span><span className="metric-val">8 min 12 sec</span></div>
            <div className="metric-row"><span className="metric-label">Rec. pace</span><span className="metric-val" style={{color:regimeColor}}>2,073 shares/min</span></div>
            <div className="h-1.5 bg-surface0 rounded-full overflow-hidden mt-3 mb-1.5">
              <motion.div className="h-full rounded-full" style={{background:regimeColor}}
                initial={{width:0}} animate={{width:'62%'}} transition={{duration:.8}} />
            </div>
            <p className="text-[10px] text-overlay0">62% of interval target reached</p>
          </div>

          {/* Alerts */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-3">Alert System</h3>
            <div className="alert-row alert-red">🔴 India VIX spiked +15%. RL recommending pace reduction.</div>
            <div className="alert-row alert-yellow">🟡 Volume 18% below 30-day avg. Monitoring.</div>
            <div className="alert-row alert-green">🟢 Executing within SEBI parameters.</div>
            <div className="alert-row alert-green">🟢 No circuit breaker proximity detected.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Intraday price chart */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-4">Intraday Price + Execution Points</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={intradayData} margin={{top:4,right:4,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(69,71,90,0.4)" />
                <XAxis dataKey="time" tick={{fill:'#9399b2',fontSize:10}} />
                <YAxis tick={{fill:'#9399b2',fontSize:11}} tickFormatter={v=>`₹${v}`}
                       domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip contentStyle={{background:'#181825',border:'1px solid #45475a',borderRadius:8}}
                  formatter={(v:any) => [`₹${v}`,'']} />
                <Line type="monotone" dataKey="price" stroke="#89b4fa" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="exec"  stroke="transparent"
                  dot={(props:any) => props.payload.exec
                    ? <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill="#cba6f7" />
                    : <g key={props.key}/>}
                  activeDot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* RL agent log */}
          <div className="card">
            <h3 className="font-syne font-semibold text-[13px] text-subtext1 mb-3">RL Agent Decision Feed</h3>
            <div className="bg-crust border border-surface0 rounded-[10px] p-4
                            max-h-52 overflow-y-auto flex flex-col gap-2">
              {logs.map((log, i) => (
                <motion.div key={`${log.time}-${i}`} className="flex gap-3 text-[11px]"
                  initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}>
                  <span className="text-overlay1 flex-shrink-0 w-11">{log.time}</span>
                  <span>
                    <span className={log.highlight ? 'text-mauve' : 'text-subtext1'}>{log.msg}</span>
                    {log.sub && <><br/><span className="text-subtext0 text-[10px]">{log.sub}</span></>}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
