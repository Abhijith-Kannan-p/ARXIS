import type {
  StockSearchResult, StockProfile, RegimeData,
  GenerateRequest, GenerateResponse,
  ScheduleData, RiskData, RiskComparison, ReportData,
} from '@/types'

const BASE = '/api'
const REQUEST_TIMEOUT_MS = 12000

function withTimeout(init?: RequestInit): { init: RequestInit; timeout: ReturnType<typeof setTimeout> } {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return { init: {
    ...init,
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  }, timeout }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const req = withTimeout(init)
  try {
    const res = await fetch(BASE + path, req.init)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      
      // FIX: Check if detail is an array (FastAPI validation error) or string
      let errorMessage = res.statusText
      if (typeof err.detail === 'string') {
        errorMessage = err.detail
      } else if (Array.isArray(err.detail)) {
        errorMessage = JSON.stringify(err.detail) // Stringify the Pydantic array!
      }
      
      throw new Error(errorMessage)
    }
    return res.json() as Promise<T>
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    clearTimeout(req.timeout)
  }
}

// ── Stocks ─────────────────────────────────────────────────────
export const searchStocks = (q: string) =>
  request<StockSearchResult[]>(`/v1/stocks/search?q=${encodeURIComponent(q)}`)

export const getStockProfile = (ticker: string) =>
  request<StockProfile>(`/v1/stocks/${ticker}/profile`)

export const getStockRegime = (ticker: string) =>
  request<RegimeData>(`/v1/stocks/${ticker}/regime`)

// ── Execution ──────────────────────────────────────────────────
export const generateStrategy = (body: GenerateRequest) =>
  request<GenerateResponse>('/v1/execution/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const getSchedule = (id: string) =>
  request<ScheduleData>(`/v1/execution/${id}/schedule`)

export const getRisk = (id: string) =>
  request<RiskData>(`/v1/execution/${id}/risk`)

export const simulate = (id: string, scenario: 'normal' | 'high_vol' | 'flash_crash') =>
  request<RiskComparison>(`/v1/execution/${id}/simulate`, {
    method: 'POST',
    body: JSON.stringify({ scenario }),
  })

export const getReport = (id: string) =>
  request<ReportData>(`/v1/execution/${id}/report`)

// ── Health ─────────────────────────────────────────────────────
export const checkHealth = () =>
  request<{ status: string }>('/health').then(() => true).catch(() => false)
