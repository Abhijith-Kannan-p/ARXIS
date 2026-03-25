'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-2xl font-semibold text-text">Something went wrong</h2>
      <p className="max-w-xl text-sm text-overlay1">
        An unexpected UI error occurred. Try again, or refresh the page if this keeps happening.
      </p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  )
}
