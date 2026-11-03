import { createPublicClient, decodeEventLog, encodeFunctionData, http, type Address, type Hex } from 'viem'
import { controlsAbi, erc20Abi, routerAbi, transferAbi } from './abi'
import { ETH_CLIENT, ETH_RPC, EVM_CHAIN, ROUTER, TOKENS, TRANSFER, type Token } from './config'
import { sendEvm, type WalletOption } from './wallets'

export const publicClient = createPublicClient({ chain: EVM_CHAIN, transport: http(ETH_RPC, { timeout: 20_000, retryCount: 1 }) })
export const ethBalance = (token: Token, address: Address) => publicClient.readContract({ address: TOKENS[token].address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
export const reservedToken = (token: Token) => publicClient.readContract({ address: TRANSFER, abi: controlsAbi, functionName: 'reserved', args: [ETH_CLIENT, TOKENS[token].address] })
export function sendTransferArgs(token: Token, amount: bigint, receiver: string, timeout: bigint) {
  return { denom: TOKENS[token].address, amount, receiver, sourceClient: ETH_CLIENT, destPort: 'transfer', timeoutTimestamp: timeout, memo: '' }
}
export function encodeTransfer(token: Token, amount: bigint, receiver: string, timeout: bigint): Hex {
  return encodeFunctionData({ abi: transferAbi, functionName: 'sendTransfer', args: [sendTransferArgs(token, amount, receiver, timeout)] })
}
export async function approveIfNeeded(option: WalletOption, account: Address, token: Token, amount: bigint, onHash: (hash: Hex) => void) {
  const allowance = await publicClient.readContract({ address: TOKENS[token].address, abi: erc20Abi, functionName: 'allowance', args: [account, TRANSFER] })
  if (allowance >= amount) return
  const hash = await sendEvm(option, account, TOKENS[token].address, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [TRANSFER, amount] }))
  onHash(hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (receipt.status !== 'success') throw new Error('The approval transaction reverted. The bridge transfer has not been submitted.')
}
export async function simulateTransfer(account: Address, token: Token, amount: bigint, receiver: string, timeout: bigint) {
  await publicClient.simulateContract({ account, address: TRANSFER, abi: transferAbi, functionName: 'sendTransfer', args: [sendTransferArgs(token, amount, receiver, timeout)] })
}
export function sequenceFromReceipt(logs: { address: string; data: Hex; topics: readonly Hex[] }[]): string {
  for (const log of logs) {
    if (log.address.toLowerCase() !== ROUTER.toLowerCase()) continue
    try {
      const event = decodeEventLog({ abi: routerAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName === 'SendPacket' && event.args.packet.sourceClient === ETH_CLIENT) return event.args.packet.sequence.toString()
    } catch { /* Other logs in the same receipt are unrelated. */ }
  }
  throw new Error(`The transaction receipt has no SendPacket for ${ETH_CLIENT}.`)
}
