import { resolve } from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  outputFileTracingRoot: resolve(__dirname, '../../'),
}

export default nextConfig
