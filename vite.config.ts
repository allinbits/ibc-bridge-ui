import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { selectRoute } from './src/lib/routes.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const name = env.VITE_BRIDGE_ROUTE ?? 'sepolia'
  const deployment = name === 'arc' && env.VITE_BRIDGE_CONFIG ? JSON.parse(readFileSync(resolve(env.VITE_BRIDGE_CONFIG), 'utf8')) : undefined
  const route = selectRoute(name, deployment)
  return {
    plugins: [react(), {
      name: 'bridge-route-metadata',
      resolveId: (id: string) => id === 'virtual:bridge-route' ? '\0virtual:bridge-route' : undefined,
      load: (id: string) => id === '\0virtual:bridge-route' ? `export default ${JSON.stringify(route)}` : undefined,
      transformIndexHtml: (html: string) => route.id === 'sepolia' ? html : html
        .replace('Transfer test GNOT and TERC between gno.land test-ibc-1 and Ethereum Sepolia over IBC.', `Transfer test ${Object.keys(route.tokens).join(' and ')} between gno.land ${route.gno.chainId} and ${route.evm.label} over IBC.`)
        .replace('https://bridge.2-29-108-12.sslip.io/', `${route.origin}/`),
    }],
    base: '/',
    build: { target: 'es2022' },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  }
})
