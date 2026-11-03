import { GNO_CLIENT, ROUTE } from './config'

export interface RouteDenom { denom: string; fee: string; send_max: string; send_min: string; decimals: number }
export interface Route { route: string; client: string; closed: boolean; loss_closed: boolean; denoms: RouteDenom[] }
export interface Claim { key: string; denom: string; to: string; amount: string; paid: string; reduced: string; fee: string; state: string; at: number }
export interface SendRecord {
  key: string; sender: string; receiver: string; denom: string; amount: string; fee: string;
  sent_height: number | string; outcome: string; payment: string; refunded: string;
  packet: { sequence: number | string; timeout_timestamp: number | string }
}
export interface Page<T> { entries: T[]; next: string }

// tm2 renders amounts as strings; packet sequences may be bare uint64 JSON
// numbers. Preserve large integers before JSON.parse can round them.
export function parseRendered<T>(text: string): T {
  const plain = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '')
  const lossless = plain.replace(/"(?:\\.|[^"\\])*"|(-?\d{16,})(?=\s*[,}\]])/g, (match, integer: string | undefined) => integer ? `"${integer}"` : match)
  return JSON.parse(lossless) as T
}

export function claimRemaining(claim: Claim): bigint {
  const remaining = BigInt(claim.amount) - BigInt(claim.paid) - BigInt(claim.reduced)
  return remaining > 0n ? remaining : 0n
}
export function openClaims(claims: Claim[], address: string): Claim[] {
  return claims.filter(c => c.to === address && c.state === 'open' && claimRemaining(c) > 0n)
}
export function packetKey(sequence: bigint | string): string {
  return `${GNO_CLIENT}/${BigInt(sequence).toString().padStart(20, '0')}`
}
export function sendState(record: SendRecord): { status: string; detail: string } {
  if (record.outcome === 'success') return { status: 'complete', detail: `Delivered on ${ROUTE.evm.family === 'Arc' ? 'Arc' : ROUTE.evm.name}; acknowledgement received on gno.` }
  if (['error', 'timeout'].includes(record.outcome)) {
    if (record.payment === 'paid' && BigInt(record.refunded) >= BigInt(record.amount)) return { status: 'refunded', detail: `${record.outcome === 'timeout' ? 'Timed out' : 'Destination refused the transfer'}. The full token amount was refunded; fees are not refunded.` }
    return { status: 'refund-pending', detail: 'Transfer failed; the refund is queued or partially paid. Claim refunds when the route permits.' }
  }
  return { status: 'relaying', detail: ROUTE.timing.pendingSend }
}
