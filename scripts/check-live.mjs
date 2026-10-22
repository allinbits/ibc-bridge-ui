import assert from 'node:assert/strict'
import { createPublicClient, decodeFunctionData, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'

const origin = 'https://bridge.2-29-108-12.sslip.io'
const rpc = 'https://rpc.2-29-108-12.sslip.io'
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
const eth = createPublicClient({ chain: sepolia, transport: http('https://rpc.sepolia.ethpandaops.io', { timeout: 20_000 }) })
const tokenAbi = parseAbi(['function decimals() view returns(uint8)', 'function reserved(string,address) view returns(uint256)'])
const transfer = '0xe44499e840797B6b452f074100BC66030dBf69F5'
const gnot = '0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212'
const terc = '0xBb30A5eEC397174d5DA58C4D180459DA51114988'
const [route, claims, sends, gnotDecimals, tercDecimals, reserved, chain, preflight] = await Promise.all([
  query('vm/qrender', `${realm}:routes/ethereum-1`),
  query('vm/qrender', `${realm}:routes/ethereum-1/claims`),
  query('vm/qrender', `${realm}:routes/ethereum-1/sends`),
  eth.readContract({ address: gnot, abi: tokenAbi, functionName: 'decimals' }),
  eth.readContract({ address: terc, abi: tokenAbi, functionName: 'decimals' }),
  eth.readContract({ address: transfer, abi: tokenAbi, functionName: 'reserved', args: ['client-0', terc] }),
  eth.getChainId(),
  fetch(rpc, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(20_000) }),
])
assert.equal(route.client, 'ethereum-1')
assert(route.denoms.find(d => d.denom === 'ugnot'))
assert(Array.isArray(claims.entries) && Array.isArray(sends.entries))
assert.equal(gnotDecimals, 6)
assert.equal(tercDecimals, 18)
assert.equal(chain, 11155111)
assert(preflight.ok, 'gno CORS preflight failed')
assert([origin, '*'].includes(preflight.headers.get('access-control-allow-origin')))
assert(/POST/i.test(preflight.headers.get('access-control-allow-methods') ?? ''))
assert(/content-type/i.test(preflight.headers.get('access-control-allow-headers') ?? ''))
const historical = await eth.getTransaction({ hash: '0x2f70d05ee1c9aa28edc38cfb096602fa21277bdfc3c36a661a220cc87ff176e1' })
const abi = parseAbi(['function sendTransfer((address denom,uint256 amount,string receiver,string sourceClient,string destPort,uint64 timeoutTimestamp,string memo) msg_) returns(uint64)'])
const decoded = decodeFunctionData({ abi, data: historical.input })
assert.equal(decoded.args[0].amount, 10n ** 19n)
assert.equal(decoded.args[0].sourceClient, 'client-0')
assert.equal(decoded.args[0].destPort, 'transfer')
console.log('Live checks passed: tm2 render, claims, sends, CORS POST + preflight, Sepolia chain, token decimals, reserved(), historical sendTransfer decoding.')
console.log(`gno fee: ${route.denoms.find(d => d.denom === 'ugnot').fee} ugnot; TERC reserved: ${reserved}; captured claims: ${claims.entries.length}; sends: ${sends.entries.length}.`)
