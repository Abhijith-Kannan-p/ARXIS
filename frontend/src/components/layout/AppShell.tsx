'use client'
import { useEffect } from 'react'
import TopNav from '@/components/layout/TopNav'
import { useStore } from '@/store/execution'
import { checkHealth } from '@/lib/api'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const setBackendOnline = useStore(s => s.setBackendOnline)

  useEffect(() => {
    let mounted = true
    const syncHealth = () => {
      checkHealth().then((online) => {
        if (mounted) setBackendOnline(online)
      }).catch(() => {
        if (mounted) setBackendOnline(false)
      })
    }
    syncHealth()
    const interval = setInterval(syncHealth, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [setBackendOnline])

  return (
    <div className="flex flex-col h-screen">
      <TopNav />
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-crust">
        {children}
      </main>
    </div>
  )
}
