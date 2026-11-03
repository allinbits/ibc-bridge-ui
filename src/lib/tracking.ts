import { hexToString, type Address, type Hex } from 'viem'
import { routerAbi } from './abi'
import { ETH_CLIENT, GNO_CLIENT, GNO_RPC, GNOWEB, ROUTE, ROUTER, TOKENS } from './config'
import { ethBalance, publicClient, sequenceFromReceipt } from './ethereum'
import { getClaims, getSends, gnoBalance, gnoRpc } from './gno'
import type { TransferEntry } from './history'
import { packetKey, sendState, type Claim } from './status'

interface GnoTx {
  error?: { message: string }
  result?: { height: string; tx_result: { ResponseBase: { Error: unknown; Log: string; Events: { type: string; attrs?: { key: string; value: string }[] }[] } } }
}
export function gnoHashBase64(hash: string): string {
  const hex = hash.replace(/^0x/, '')
  if (/^[a-f\d]{64}$/i.test(hex)) return btoa(String.fromCharCode(...hex.match(/../g)!.map(s => parseInt(s, 16))))
  if (atob(hash).length !== 32) throw new Error('Invalid gno transaction hash.')
  return hash
}
export function gnoTxInfo(response: unknown): { height: string; sequence?: string; error?: string } {
  const tx = response as GnoTx
  if (tx.error) throw new Error(tx.error.message)
  if (!tx.result) throw new Error('The gno transaction is not indexed yet.')
  const base = tx.result.tx_result.ResponseBase
  if (base.Error) return { height: tx.result.height, error: base.Log || JSON.stringify(base.Error) }
  const event = base.Events?.find(e => e.type === 'send_packet' && e.attrs?.some(a => a.key === 'packet_source_client' && a.value === GNO_CLIENT))
  return { height: tx.result.height, sequence: event?.attrs?.find(a => a.key === 'packet_sequence')?.value }
}
export const getGnoTx = async (hash: string) => gnoTxInfo(await gnoRpc('tx', { hash: gnoHashBase64(hash) }))
export function transactionUrl(hash: string, chain: 'gno' | 'eth'): string {
  return chain === 'eth' ? `${ROUTE.evm.explorer}/tx/${hash}` : `${GNO_RPC}/tx?hash=${encodeURIComponent(gnoHashBase64(hash))}`
}
export const recordUrl = (entry: TransferEntry) => `${GNOWEB}/r/aib/ibc/apps/transfer:routes/${GNO_CLIENT}/${entry.direction === 'gno-eth' ? 'sends' : 'claims'}${entry.sequence ? `?from=${encodeURIComponent(packetKey(entry.sequence))}` : ''}`
export function claimState(claim: Claim): { status: string; detail: string } {
  if (claim.state === 'done' && BigInt(claim.reduced) === 0n && BigInt(claim.paid) >= BigInt(claim.amount)) return { status: 'complete', detail: 'Claim paid on gno. The claim fee was deducted at payout; the destination balance has been refreshed.' }
  if (claim.state === 'open') return { status: 'claimable', detail: 'Arrived on gno. Use Claim with Adena to pay the route’s queue; payout limits can require more than one call.' }
  return { status: 'attention', detail: `The claim is ${claim.state}${BigInt(claim.reduced) > 0n ? ' with a governance reduction' : ''}. Contact the operators; it has not been marked complete.` }
}

export async function trackEntry(entry: TransferEntry): Promise<TransferEntry> {
  const next = { ...entry, pollError: undefined, updated: Date.now() }
  if (!entry.hash) return next
  if (entry.direction === 'gno-eth') {
    if (!next.sequence) {
      const tx = await getGnoTx(entry.hash)
      next.sourceHeight = tx.height
      if (tx.error) return { ...next, status: 'failed', detail: `gno VM: ${tx.error}` }
      if (!tx.sequence) return { ...next, status: 'attention', detail: 'The gno transaction has no send_packet event. Check the transaction result with the operators.' }
      next.sequence = tx.sequence
    }
    const sends = await getSends()
    const record = sends.find(s => s.key === packetKey(next.sequence!))
    if (!record) throw new Error('The source transaction is confirmed; its send record is not available yet.')
    if (record.sender !== entry.sender || record.receiver.toLowerCase() !== entry.receiver.toLowerCase() || record.amount !== entry.amount || record.denom !== TOKENS[entry.token].denom) throw new Error('The packet record does not match this transfer. Contact the operators.')
    Object.assign(next, sendState(record))
    // Refresh the destination balance independently of acknowledgement timing.
    next.destinationBalance = (await ethBalance(entry.token, entry.receiver as Address)).toString()
    if (next.status !== 'relaying') return next
    if (!next.relayHash && next.ethStartBlock) {
      const head = await publicClient.getBlockNumber()
      const from = BigInt(next.ethScanBlock ?? next.ethStartBlock)
      const to = head < from + 499n ? head : from + 499n
      if (from <= to) {
        const logs = await publicClient.getContractEvents({ address: ROUTER, abi: routerAbi, eventName: 'WriteAcknowledgement', args: { sequence: BigInt(next.sequence) }, fromBlock: from, toBlock: to })
        const log = logs.find(l => l.args.packet?.sourceClient === GNO_CLIENT && l.args.packet?.destClient === ETH_CLIENT)
        if (log) {
          next.relayHash = log.transactionHash ?? undefined
          const ack = log.args.acknowledgements?.[0]
          if (ack && hexToString(ack) === '{"result":"AQ=="}') {
            next.status = 'delivered'
            next.detail = ROUTE.timing.delivered
          } else {
            next.status = 'refund-pending'
            next.detail = `${ROUTE.evm.name} refused delivery. Waiting for an error acknowledgement and refund on gno. A recent ${ROUTE.id === 'sepolia' ? 'TERC' : entry.token} send may still have reserved escrow.`
          }
        }
        next.ethScanBlock = (to + 1n).toString()
      }
    } else if (entry.status === 'delivered' || (entry.status === 'refund-pending' && entry.relayHash)) {
      next.status = entry.status
      next.detail = entry.detail
    }
  } else {
    if (!next.sequence) {
      const receipt = await publicClient.getTransactionReceipt({ hash: entry.hash as Hex })
      if (receipt.status === 'reverted') return { ...next, status: 'failed', detail: `The ${ROUTE.evm.name} transaction reverted. No bridge packet was sent. Gas was still spent.` }
      next.sequence = sequenceFromReceipt(receipt.logs)
      next.sourceHeight = receipt.blockNumber.toString()
      next.ethStartBlock = receipt.blockNumber.toString()
      next.ethScanBlock = receipt.blockNumber.toString()
    }
    const claims = await getClaims()
    const claim = claims.find(c => c.key === packetKey(next.sequence!))
    if (claim) {
      if (claim.to !== entry.receiver || claim.denom !== TOKENS[entry.token].denom || claim.amount !== entry.amount) throw new Error('The destination claim does not match this transfer. Contact the operators.')
      next.destinationBalance = (await gnoBalance(entry.token, entry.receiver)).toString()
      return { ...next, ...claimState(claim) }
    }
    next.status = ROUTE.id === 'arc' ? 'relaying' : 'finalizing'
    next.detail = ROUTE.timing.pendingIncoming
    const head = await publicClient.getBlockNumber()
    const from = BigInt(next.ethScanBlock ?? next.ethStartBlock!)
    const to = head < from + 499n ? head : from + 499n
    if (from <= to) {
      const [acks, timeouts] = await Promise.all([
        publicClient.getContractEvents({ address: ROUTER, abi: routerAbi, eventName: 'AckPacket', args: { sequence: BigInt(next.sequence) }, fromBlock: from, toBlock: to }),
        publicClient.getContractEvents({ address: ROUTER, abi: routerAbi, eventName: 'TimeoutPacket', args: { sequence: BigInt(next.sequence) }, fromBlock: from, toBlock: to }),
      ])
      const failed = timeouts.some(l => l.args.packet?.sourceClient === ETH_CLIENT) || acks.some(l => l.args.packet?.sourceClient === ETH_CLIENT && l.args.acknowledgement === '0x4774d4a575993f963b1c06573736617a457abef8589178db8d10c94b4ab511ab')
      if (failed) return { ...next, status: 'attention', detail: `The packet failed or timed out on ${ROUTE.evm.name}. Refunds may be queued by route controls. Check your token balance and contact the operators.` }
      next.ethScanBlock = (to + 1n).toString()
    }
  }
  if (BigInt(Math.floor(Date.now() / 1000)) > BigInt(entry.timeout) && !['complete', 'refunded', 'claimable', 'delivered'].includes(next.status)) next.detail += ' The packet timeout has passed; this does not refund automatically. The relayer must submit a timeout proof.'
  return next
}
