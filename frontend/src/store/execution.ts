import { create } from 'zustand'
import type {
  StockProfile, GenerateResponse, ScheduleData,
  RiskData, RegimeData, ReportData, RegimeId,
} from '@/types'

interface ExecutionStore {
  // Selected stock (from profile API)
  selectedStock: StockProfile | null
  setSelectedStock: (s: StockProfile | null) => void

  // Execution result (from /generate)
  executionResult: GenerateResponse | null
  executionId: string | null
  setExecutionResult: (r: GenerateResponse) => void

  // Sub-page data (lazy loaded)
  scheduleData: ScheduleData | null
  setScheduleData: (d: ScheduleData) => void

  riskData: RiskData | null
  setRiskData: (d: RiskData) => void

  regimeData: RegimeData | null
  setRegimeData: (d: RegimeData) => void

  reportData: ReportData | null
  setReportData: (d: ReportData) => void

  // Global regime badge (top nav)
  currentRegime: RegimeId
  setCurrentRegime: (r: RegimeId) => void

  // Backend online status
  backendOnline: boolean
  setBackendOnline: (v: boolean) => void

  // Reset when new execution starts
  resetExecution: () => void
}

export const useStore = create<ExecutionStore>((set) => ({
  selectedStock:   null,
  setSelectedStock: (s) => set({ selectedStock: s }),

  executionResult: null,
  executionId:     null,
  setExecutionResult: (r) => set({ executionResult: r, executionId: r.execution_id }),

  scheduleData: null,
  setScheduleData: (d) => set({ scheduleData: d }),

  riskData: null,
  setRiskData: (d) => set({ riskData: d }),

  regimeData: null,
  setRegimeData: (d) => set({ regimeData: d }),

  reportData: null,
  setReportData: (d) => set({ reportData: d }),

  currentRegime: 1,
  setCurrentRegime: (r) => set({ currentRegime: r }),

  backendOnline: false,
  setBackendOnline: (v) => set({ backendOnline: v }),

  resetExecution: () => set({
    scheduleData: null,
    riskData:     null,
    regimeData:   null,
    reportData:   null,
  }),
}))
