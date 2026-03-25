import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // Changed localhost to 127.0.0.1
        destination: `${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/:path*`,
      },
    ]
  },
}

export default nextConfig