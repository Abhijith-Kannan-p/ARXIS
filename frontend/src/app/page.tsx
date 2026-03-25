'use client'
import React, { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import HeroCanvas from '@/components/landing/HeroCanvas'

const STEPS = [
  {
    num: '1', color: '#cba6f7', label: 'Regime Detection',
    icon: '◈', title: 'HMM Classifies the Market',
    desc: 'A Gaussian Hidden Markov Model observes India VIX, realised volatility, price momentum, and volume — classifying the market into one of four regimes in real time.',
    tags: ['R0 Trending ↑','R1 Mean-Rev','R2 High Vol ↓','R3 Crisis'],
    tagClasses: ['tag-green','tag-yellow','tag-peach','tag-red'],
  },
  {
    num: '2', color: '#89b4fa', label: 'RL Execution',
    icon: '◉', title: 'QR-DQN Agent Optimises',
    desc: 'The regime label feeds into the RL agent\'s state alongside remaining inventory, time, VIX, and price drift. A Quantile Regression DQN minimises CVaR — not just average slippage.',
    tags: ['Minimises 95% CVaR','Real-time adaptive'],
    tagClasses: ['tag-blue','tag-mauve'],
  },
  {
    num: '3', color: '#94e2d5', label: 'Cost Benchmark',
    icon: '∑', title: 'AC Model Benchmarks',
    desc: 'The classical Almgren-Chriss closed-form solution runs in parallel as a mathematical baseline — shown alongside the RL schedule so you always see the exact improvement.',
    tags: ['Transparency benchmark'],
    tagClasses: ['tag-mauve'],
  },
]

export default function LandingPage() {
  const router    = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll after hero animation settles
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 6500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-crust" id="landing-scroll">

      {/* ── Hero ──────────────────────────────────── */}
      <div className="relative w-full h-screen flex items-center justify-center flex-col overflow-hidden flex-shrink-0">
        <HeroCanvas />

        <motion.div
          className="relative z-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          <h1 className="font-syne font-extrabold text-[88px] leading-none tracking-[16px]
                         bg-gradient-to-br from-mauve via-blue to-sapphire
                         bg-clip-text text-transparent select-none">
            ARXIS
          </h1>
          <p className="text-[13px] text-subtext0 tracking-[4px] uppercase mt-4 mb-10">
            Institutional-grade execution intelligence for NSE equities
          </p>
          <button
            onClick={() => router.push('/configure')}
            className="px-12 py-3.5 border border-mauve text-mauve text-[13px]
                       tracking-[3px] uppercase font-mono rounded cursor-pointer
                       relative overflow-hidden group transition-colors duration-300
                       hover:text-crust"
          >
            <span className="absolute inset-0 bg-mauve -translate-x-full group-hover:translate-x-0
                             transition-transform duration-300 -z-10" />
            ▶ OPEN TERMINAL
          </button>
        </motion.div>

        {/* Scroll hint */}
        <motion.button
          className="absolute bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.4, duration: 0.8 }}
          onClick={() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="text-[9px] text-overlay0 tracking-[3px] uppercase">How it works</span>
          <div className="w-px h-7 bg-gradient-to-b from-overlay0 to-transparent" />
          <div className="w-3 h-3 border-r border-b border-overlay0 rotate-45 animate-chevron-bounce" />
        </motion.button>
      </div>

      {/* ── How it works ──────────────────────────── */}
      <div ref={scrollRef} className="bg-mantle px-16 py-20 border-t border-surface0">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] text-mauve tracking-[3px] uppercase text-center mb-3">
            How ARXIS Works
          </p>
          <h2 className="font-syne font-bold text-[32px] text-text text-center mb-3">
            One System. Three Layers. Always Running Together.
          </h2>
          <p className="text-[12px] text-subtext0 text-center max-w-xl mx-auto mb-14 leading-relaxed">
            ARXIS combines three mathematical frameworks into a single unified execution engine.
            Each layer feeds directly into the next — configure once, ARXIS handles the rest.
          </p>

          {/* Steps */}
          <div className="grid grid-cols-[1fr_48px_1fr_48px_1fr] gap-0 items-stretch mb-14">
            {STEPS.map((step, i) => (
              <React.Fragment key={step.num}>
                <motion.div
                  className="bg-base border border-surface0 rounded-2xl p-7
                             hover:border-mauve hover:-translate-y-1 transition-all duration-300"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center
                                    border font-syne font-extrabold text-sm flex-shrink-0"
                         style={{ background: `${step.color}20`, borderColor: `${step.color}60`, color: step.color }}>
                      {step.num}
                    </div>
                    <span className="text-[10px] uppercase tracking-[2px]" style={{ color: step.color }}>
                      {step.label}
                    </span>
                  </div>
                  <div className="text-2xl mb-2.5" style={{ color: step.color }}>{step.icon}</div>
                  <div className="font-syne font-bold text-[15px] text-text mb-2">{step.title}</div>
                  <p className="text-[11px] text-subtext0 leading-[1.75] mb-3">{step.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {step.tags.map((t, j) => (
                      <span key={t} className={`tag ${step.tagClasses[j]} text-[9px]`}>{t}</span>
                    ))}
                  </div>
                </motion.div>

                {i < 2 && (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="text-xl opacity-50" style={{ color: STEPS[i].color }}>→</span>
                    <span className="text-[9px] text-overlay0 text-center leading-tight">
                      {i===0?'regime\nlabel':'optimal\nschedule'}
                    </span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Output callout */}
          <div className="flex items-center gap-3 mx-auto w-fit px-7 py-3
                          bg-mauve/5 border border-mauve/20 rounded-xl mb-10">
            <span className="text-lg">⚡</span>
            <span className="text-[12px] text-subtext1">
              Output: a single execution plan — interval-by-interval, CVaR-optimised, regime-adaptive, with AC benchmark shown for full transparency.
            </span>
          </div>

          {/* Disclaimer */}
          <div className="disclaimer max-w-3xl mx-auto">
            ⚠ Market data delayed 15 minutes via Yahoo Finance. For production use, connect Upstox API or Angel One SmartAPI.
          </div>

          {/* Enter Terminal CTA */}
          <div className="text-center mt-16 pb-16">
            <div className="w-px h-12 bg-gradient-to-b from-transparent to-mauve/40 mx-auto mb-8" />
            <p className="text-[11px] text-overlay0 tracking-[3px] uppercase mb-5">
              Ready to optimise your execution?
            </p>
            <motion.button
              onClick={() => router.push('/configure')}
              className="group inline-flex items-center gap-4 px-14 py-5
                         border border-mauve/50 text-text font-syne font-bold text-lg
                         tracking-wide rounded cursor-pointer relative overflow-hidden
                         hover:border-mauve hover:shadow-[0_0_40px_rgba(203,166,247,0.2)]
                         transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="absolute inset-0 bg-gradient-to-br from-mauve/10 to-blue/5
                               -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
              Enter Terminal
              <span className="text-mauve text-xl group-hover:translate-x-1.5 transition-transform duration-300">
                →
              </span>
            </motion.button>
            <p className="text-[10px] text-overlay0 mt-5">
              Configure your stock · Set parameters · Get your regime-aware execution plan
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}