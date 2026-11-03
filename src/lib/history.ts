import { ROUTE, TOKENS, type Direction, type Token } from './config'

export interface TransferEntry {
  id: string; direction: Direction; token: Token; amount: string; sender: string; receiver: string;
  hash?: string; approvalHash?: string; claimHash?: string; relayHash?: string;
  created: number; timeout: string; sourceHeight?: string; sequence?: string;
  ethStartBlock?: string; ethScanBlock?: string; destinationBaseline?: string; destinationBalance?: string;
  status: string; detail: string; pollError?: string; updated?: number;
}
const keyFor = (address: string) => `gno-bridge:v1:${ROUTE.id === 'sepolia' ? '' : `${ROUTE.id}:${ROUTE.gno.chainId}:`}${address.toLowerCase()}`
export const isTerminal = (status: string) => ['complete', 'refunded', 'failed', 'approval-only'].includes(status)
export function loadHistory(addresses: string[]): TransferEntry[] {
  const entries = new Map<string, TransferEntry>()
  for (const address of addresses.filter(Boolean)) {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(keyFor(address)) || '[]')
      if (!Array.isArray(stored)) continue
      for (const e of stored) {
        if (!e || typeof e.id !== 'string' || !['gno-eth', 'eth-gno'].includes(e.direction) || !Object.hasOwn(TOKENS, e.token) || !/^\d+$/.test(e.amount) || typeof e.sender !== 'string' || typeof e.receiver !== 'string' || typeof e.status !== 'string' || !/^\d+$/.test(e.timeout)) continue
        if (![e.sender, e.receiver].some(a => a.toLowerCase() === address.toLowerCase())) continue
        const previous = entries.get(e.id)
        if (!previous || (e.updated ?? 0) > (previous.updated ?? 0)) entries.set(e.id, e as TransferEntry)
      }
    } catch { /* Invalid or unavailable storage should not stop wallet use. */ }
  }
  return [...entries.values()].map(e => !e.hash && e.approvalHash ? { ...e, status: 'approval-only', detail: 'Only a token approval was recorded. Check its receipt, then submit the transfer form to continue; an existing allowance is reused.' } : e).sort((a, b) => b.created - a.created)
}
export function saveEntry(entry: TransferEntry): boolean {
  try {
    for (const address of [entry.sender, entry.receiver]) {
      const items = loadHistory([address]).filter(e => e.id !== entry.id)
      items.unshift(entry)
      // Retain every pending transfer, plus the latest 100 finished ones.
      const pending = items.filter(e => !isTerminal(e.status))
      const finished = items.filter(e => isTerminal(e.status)).slice(0, 100)
      localStorage.setItem(keyFor(address), JSON.stringify([...pending, ...finished]))
    }
    return true
  } catch { return false }
}
