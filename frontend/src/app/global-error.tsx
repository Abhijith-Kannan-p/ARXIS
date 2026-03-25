'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error(error)

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center bg-crust">
          <h2 className="text-2xl font-semibold text-text">Application error</h2>
          <p className="max-w-xl text-sm text-overlay1">
            A fatal client error occurred. Please retry.
          </p>
          <button className="btn btn-primary" onClick={reset}>Reload app state</button>
        </div>
      </body>
    </html>
  )
}
