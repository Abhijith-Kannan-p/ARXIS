import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // FIX 1: Explicitly use 127.0.0.1 instead of localhost
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    
    const response = await fetch(`${backendUrl}/api/health`)
    
    // FIX 2: Check if the fetch actually succeeded before parsing JSON
    if (!response.ok) {
        throw new Error(`Backend returned status: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    // FIX 3: Log the actual error to your Next.js terminal!
    console.error("Health API Route Error:", error)
    
    return NextResponse.json(
      { error: 'Backend not available' }, 
      { status: 500 }
    )
  }
}