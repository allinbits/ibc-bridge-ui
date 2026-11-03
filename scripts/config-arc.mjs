import { readFileSync, writeFileSync } from 'node:fs'
import { arcRoute } from '../src/lib/routes.ts'

const [source, destination] = process.argv.slice(2)
if (!source || !destination) throw new Error('Usage: npm run config:arc -- <contracts/deployments/5042002.json> <arc.local.json>')
const deployment = JSON.parse(readFileSync(source, 'utf8'))
const route = arcRoute(deployment)
const config = {
  chainId: route.evm.chainId, gnoChainId: route.gno.chainId, counterpartyClientId: route.gno.clientId, clientId: route.evm.clientId,
  ...route.contracts, tokens: route.tokens,
}
writeFileSync(destination, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
console.log(`Wrote ${destination}. Build with VITE_BRIDGE_ROUTE=arc VITE_BRIDGE_CONFIG=${destination} npm run build`)
