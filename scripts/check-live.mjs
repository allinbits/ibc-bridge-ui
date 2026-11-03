import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPublicClient, decodeFunctionData, http, parseAbi } from 'viem'
import { loadEnv } from 'vite'
import { selectRoute } from '../src/lib/routes.ts'

const env = loadEnv('production', process.cwd(), 'VITE_')
const selected = env.VITE_BRIDGE_ROUTE ?? 'sepolia'
const config = selectRoute(selected, selected === 'arc' && env.VITE_BRIDGE_CONFIG ? JSON.parse(readFileSync(env.VITE_BRIDGE_CONFIG, 'utf8')) : undefined)
const origin = config.origin
const rpc = config.gno.rpc
const realm = 'gno.land/r/aib/ibc/apps/transfer'
async function query(path, data = '') {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'abci_query', params: { path, data: Buffer.from(data).toString('base64') } }),
    signal: AbortSignal.timeout(20_000),
  })
  assert(response.ok)
  assert([origin, '*'].includes(response.headers.get('access-control-allow-origin')), 'RPC must allow the bridge origin')
  const payload = await response.json()
  assert(!payload.error, JSON.stringify(payload.error))
  const base = payload.result.response.ResponseBase
  assert(!base.Error, base.Log)
  return JSON.parse(Buffer.from(base.Data, 'base64').toString())
}
const eth = createPublicClient({ transport: http(config.evm.rpc, { timeout: 20_000, fetchOptions: { headers: { Origin: origin } } }) })
const tokenAbi = parseAbi(['function decimals() view returns(uint8)', 'function reserved(string,address) view returns(uint256)'])
const tokens = Object.values(config.tokens)
const [route, claims, sends, decimals, reserved, chain, preflight, evmCors] = await Promise.all([
  query('vm/qrender', `${realm}:routes/${config.gno.clientId}`),
  query('vm/qrender', `${realm}:routes/${config.gno.clientId}/claims`),
  query('vm/qrender', `${realm}:routes/${config.gno.clientId}/sends`),
  Promise.all(tokens.map(token => eth.readContract({ address: token.address, abi: tokenAbi, functionName: 'decimals' }))),
  Promise.all(tokens.filter(token => token.denom !== 'ugnot').map(token => eth.readContract({ address: config.contracts.ics20Transfer, abi: tokenAbi, functionName: 'reserved', args: [config.evm.clientId, token.address] }))),
  eth.getChainId(),
  fetch(rpc, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(20_000) }),
  fetch(config.evm.rpc, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(20_000) }),
])
assert.equal(route.client, config.gno.clientId)
for (const token of tokens) assert(route.denoms.find(d => d.denom === token.denom), `${token.symbol} must be enabled on the gno route`)
assert(Array.isArray(claims.entries) && Array.isArray(sends.entries))
tokens.forEach((token, i) => assert.equal(decimals[i], token.decimals, `${token.symbol} decimals`))
assert.equal(chain, config.evm.chainId)
assert(preflight.ok, 'gno CORS preflight failed')
assert([origin, '*'].includes(preflight.headers.get('access-control-allow-origin')))
assert(/POST/i.test(preflight.headers.get('access-control-allow-methods') ?? ''))
assert(/content-type/i.test(preflight.headers.get('access-control-allow-headers') ?? ''))
assert(evmCors.ok, 'EVM CORS POST failed')
assert([origin, '*'].includes(evmCors.headers.get('access-control-allow-origin')), 'EVM RPC must allow the bridge origin')
if (config.id === 'sepolia') {
  const historical = await eth.getTransaction({ hash: '0x2f70d05ee1c9aa28edc38cfb096602fa21277bdfc3c36a661a220cc87ff176e1' })
  const abi = parseAbi(['function sendTransfer((address denom,uint256 amount,string receiver,string sourceClient,string destPort,uint64 timeoutTimestamp,string memo) msg_) returns(uint64)'])
  const decoded = decodeFunctionData({ abi, data: historical.input })
  assert.equal(decoded.args[0].amount, 10n ** 19n)
  assert.equal(decoded.args[0].sourceClient, 'client-0')
  assert.equal(decoded.args[0].destPort, 'transfer')
}
console.log(`Live checks passed for ${config.id}: tm2 render, claims, sends, gno CORS POST + preflight, EVM CORS POST, chain id, token decimals, reserved().${config.id === 'sepolia' ? ' Historical Sepolia sendTransfer decoding passed.' : ''}`)
console.log(`gno fee: ${route.denoms.find(d => d.denom === 'ugnot').fee} ugnot; reserved amounts: ${reserved.join(', ')}; captured claims: ${claims.entries.length}; sends: ${sends.entries.length}.`)
