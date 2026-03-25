import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { REGIME_COLORS, type RegimeId } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtINR(n: number): string {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

export function fmtShares(n: number): string {
  return Math.round(n).toLocaleString('en-IN')
}

export function regimeClass(r: RegimeId): string {
  return ['regime-0', 'regime-1', 'regime-2', 'regime-3'][r]
}

export function regimeColor(r: RegimeId): string {
  return REGIME_COLORS[r]
}

export function advImpactColor(pct: number): string {
  if (pct < 1) return '#a6e3a1'
  if (pct < 5) return '#f9e2af'
  return '#f38ba8'
}

export function interpolateRiskColor(v: number): string {
  if (v <= 50) {
    const t = v / 50
    const r = Math.round(166 + (249 - 166) * t)
    const g = Math.round(227 + (226 - 227) * t)
    const b = Math.round(161 + (175 - 161) * t)
    return `rgb(${r},${g},${b})`
  }
  const t = (v - 50) / 50
  const r = Math.round(249 + (243 - 249) * t)
  const g = Math.round(226 + (139 - 226) * t)
  const b = Math.round(175 + (168 - 175) * t)
  return `rgb(${r},${g},${b})`
}
