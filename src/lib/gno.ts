import { GNO_CLIENT, GNO_RPC, REALM, TOKENS, type Token } from './config'
import { parseRendered, type Claim, type Page, type Route, type SendRecord } from './status'
import { quoteTransfer } from './amount'

export function decodeQueryResponse(payload: unknown): string {
  const json = payload as { error?: { message: string }; result?: { response?: Record<string, unknown> } }
  if (json.error) throw new Error(json.error.message)
  const response = json.result?.response
  if (!response) throw new Error('Malformed gno RPC response.')
  const base = (response.ResponseBase ?? response) as Record<string, unknown>
  const error = base.Error ?? base.error
  if (error || (base.code !== undefined && base.code !== 0)) throw new Error(`gno VM: ${String(base.Log || base.log || JSON.stringify(error))}`)
  const data = base.Data ?? base.data ?? response.Value ?? response.value
  if (typeof data !== 'string') throw new Error('Missing data in gno RPC response.')
  return new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0)))
}

export async function gnoRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(GNO_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`gno RPC returned HTTP ${response.status}.`)
  return response.json()
}
export async function query(path: string, data = ''): Promise<string> {
  const bytes = new TextEncoder().encode(data)
  return decodeQueryResponse(await gnoRpc('abci_query', { path, data: btoa(String.fromCharCode(...bytes)) }))
}
export async function render<T>(path: string): Promise<T> {
  return parseRendered<T>(await query('vm/qrender', `${REALM}:${path}`))
}
export async function route(): Promise<Route> {
  const data = await render<Route>(`routes/${GNO_CLIENT}`)
  if (!data || data.client !== GNO_CLIENT || !Array.isArray(data.denoms)) throw new Error('The configured gno route is unavailable or its client changed. Contact the operators.')
  return data
}
export function routeFee(data: Route, token: Token): bigint {
  const denom = data.denoms.find(d => d.denom === TOKENS[token].denom)
  if (!denom || !/^\d+$/.test(denom.fee)) throw new Error(`${token} is not enabled on this route.`)
  return BigInt(denom.fee)
}
export async function allPages<T>(path: string): Promise<T[]> {
  const entries: T[] = []
  const visited = new Set<string>()
  let cursor = ''
  do {
    if (visited.has(cursor)) throw new Error('The gno pagination cursor repeated.')
    visited.add(cursor)
    const page = await render<Page<T>>(`${path}${cursor ? `?from=${encodeURIComponent(cursor)}` : ''}`)
    if (!Array.isArray(page.entries) || typeof page.next !== 'string') throw new Error('Malformed gno status page.')
    entries.push(...page.entries)
    cursor = page.next
    if (visited.size >= 200 && cursor) throw new Error('The route has too many status pages. Contact the operators.')
  } while (cursor)
  return entries
}
export const getClaims = () => allPages<Claim>(`routes/${GNO_CLIENT}/claims`)
export const getSends = () => allPages<SendRecord>(`routes/${GNO_CLIENT}/sends`)
export async function gnoBalance(token: Token, address: string): Promise<bigint> {
  if (token === 'TERC') {
    const data = await render<{ balance: string }>(`voucher/${TOKENS.TERC.denom}/balance/${address}`)
    return BigInt(data.balance)
  }
  const coins = parseRendered<string>(await query(`bank/balances/${address}`))
  if (typeof coins !== 'string') throw new Error('Malformed native balance.')
  const coin = coins.split(',').find(c => /^\d+ugnot$/.test(c))
  return coin ? BigInt(coin.slice(0, -5)) : 0n
}

export function transferMessage(caller: string, receiver: string, token: Token, amount: bigint, fee: bigint, timeout: bigint) {
  const quote = quoteTransfer('gno-eth', token, amount, fee)
  return callMessage(caller, 'Transfer', [GNO_CLIENT, receiver, TOKENS[token].denom, amount.toString(), timeout.toString(), ''], quote.send)
}
export function callMessage(caller: string, func: string, args: string[], send = '') {
  return { messages: [{ type: '/vm.m_call', value: { caller, send, pkg_path: REALM, func, args } }] }
}
