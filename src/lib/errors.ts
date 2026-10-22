import { decodeErrorResult, type Hex } from 'viem'
import { transferAbi } from './abi'

const explanations: Record<string, string> = {
  GnoLimitsNotSet: 'This token is not enabled for this route. Governance must install its limits; contact the operators.',
  GnoEscrowReserved: 'The Ethereum escrow is still reserved for refunds. Wait about 20 minutes after the outbound transfer is acknowledged, then retry.',
  GnoSendAboveMax: 'The amount exceeds the route’s maximum per transfer. Choose a smaller amount.',
  GnoSendBelowMin: 'The amount is below the route’s minimum per transfer. Choose a larger amount.',
  GnoRoutePaused: 'The route is paused by governance or guardians. Wait for the operators to reopen it.',
  GnoQuarantined: 'The route is temporarily quarantined. Wait until the quarantine ends.',
  GnoClientRetired: 'The route client has been retired. Contact the operators for updated route settings.',
  ERC20InsufficientBalance: 'Your token balance is too low for this transfer.',
  ERC20InsufficientAllowance: 'The transfer allowance is too low. Approve the transfer contract and try again.',
  EnforcedPause: 'The bridge contract is paused. Contact the operators.',
}

export function explainError(error: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  let decoded = ''
  let rejected = false
  const walk = (value: unknown, depth = 0) => {
    if (!value || depth > 8 || seen.has(value)) return
    seen.add(value)
    if (typeof value === 'string') {
      if (/^0x[0-9a-fA-F]{8,}$/.test(value)) {
        try {
          const result = decodeErrorResult({ abi: transferAbi, data: value as Hex })
          decoded = `${result.errorName}: ${explanations[result.errorName] ?? 'The contract refused this action.'}${result.args?.length ? ` (${result.args.map(String).join(', ')})` : ''}`
        } catch { /* The value may be a transaction hash or a different contract's error. */ }
      } else parts.push(value)
      return
    }
    if (typeof value === 'object') {
      const v = value as Record<string, unknown>
      // Adena uses 4001 for several failures, unlike EIP-1193.
      if (v.code === 4000 || v.type === 'UserRejectedRequestError' || (v.code === 4001 && !v.type)) rejected = true
      for (const key of ['shortMessage', 'message', 'details', 'log', 'Log', 'data', 'cause', 'error', 'originalError', 'Error']) walk(v[key], depth + 1)
    }
  }
  walk(error)
  if (rejected || parts.some(s => /user (rejected|denied)|rejected by.*user/i.test(s))) return 'Request cancelled in your wallet. You can try again when ready.'
  if (decoded) return decoded
  const text = parts.join(' · ') || String(error)
  for (const [name, explanation] of Object.entries(explanations)) if (text.includes(name)) return `${name}: ${explanation}`
  if (/panic|vm execution|vm:|gno VM/i.test(text)) return `The gno transaction could not execute: ${text.slice(0, 1200)}`
  return text.slice(0, 1200)
}
