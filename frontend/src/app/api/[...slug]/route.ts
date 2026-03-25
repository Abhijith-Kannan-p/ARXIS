import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.slug)
}

export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.slug)
}

async function proxyRequest(request: NextRequest, slug: string[]) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const path = slug.join('/')
    const url = `${backendUrl}/api/${path}`

    const response = await fetch(url, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
      body: request.method !== 'GET' ? await request.text() : undefined,
    })

    const data = await response.text()
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Backend not available' }, { status: 500 })
  }
}