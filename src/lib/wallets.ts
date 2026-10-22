import { createWalletClient, custom, type Address, type EIP1193Provider, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { ethereumAddress, validGnoAddress } from './address'
import { GNO_CHAIN, GNO_RPC } from './config'

export interface AdenaResponse<T = Record<string, unknown>> { code: number; status: string; type: string; message: string; data: T }
export interface AdenaAccount { address: string; chainId: string }
export interface Adena {
  AddEstablish(name: string): Promise<AdenaResponse>
  GetAccount(): Promise<AdenaResponse<AdenaAccount>>
  AddNetwork(network: { chainId: string; rpcUrl: string; chainName: string }): Promise<AdenaResponse>
  SwitchNetwork(chainId: string): Promise<AdenaResponse>
  DoContract(tx: { messages: { type: string; value: { caller: string; send: string; pkg_path: string; func: string; args: string[] } }[] }): Promise<AdenaResponse<{ hash: string; height?: string; checkTx?: unknown; deliverTx?: unknown }>>
}
export interface EvmProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
  isMetaMask?: boolean
  isKeplr?: boolean
  providers?: EvmProvider[]
}
export interface WalletOption { id: string; name: string; provider: EvmProvider }
declare global {
  interface Window { adena?: Adena; ethereum?: EvmProvider; keplr?: { ethereum?: EvmProvider } }
}

export function adenaResult<T>(result: AdenaResponse<T>, allowed: string[] = []): T {
  if (result.status !== 'success' && !allowed.includes(result.type)) throw result
  return result.data
}
async function adenaResponse<T>(operation: () => Promise<AdenaResponse<T>>, allowedErrors: string[]): Promise<AdenaResponse<T>> {
  try { return await operation() }
  catch (error) {
    // Extension versions may resolve a failure envelope or reject with it.
    if (error && typeof error === 'object' && 'type' in error && allowedErrors.includes(String(error.type))) return error as AdenaResponse<T>
    throw error
  }
}
export async function readAdenaAccount(): Promise<AdenaAccount> {
  if (!window.adena) throw new Error('Install the Adena browser extension, then reload this page.')
  const account = adenaResult(await window.adena.GetAccount())
  if (!validGnoAddress(account.address)) throw new Error('Adena returned an invalid gno address.')
  if (account.chainId !== GNO_CHAIN) throw new Error('Switch Adena to test-ibc-1 using Connect Adena.')
  return account
}
export async function connectAdena(): Promise<AdenaAccount> {
  const adena = window.adena
  if (!adena) throw new Error('Install the Adena browser extension, then reload this page.')
  adenaResult(await adenaResponse(() => adena.AddEstablish('gno.land Bridge'), ['ALREADY_CONNECTED']), ['ALREADY_CONNECTED'])
  const switched = await adenaResponse(() => adena.SwitchNetwork(GNO_CHAIN), ['UNADDED_NETWORK', 'REDUNDANT_CHANGE_REQUEST'])
  if (switched.type === 'UNADDED_NETWORK') {
    adenaResult(await adenaResponse(() => adena.AddNetwork({ chainId: GNO_CHAIN, chainName: 'gno.land · test-ibc-1', rpcUrl: GNO_RPC }), ['NETWORK_ALREADY_EXISTS']), ['NETWORK_ALREADY_EXISTS'])
    adenaResult(await adenaResponse(() => adena.SwitchNetwork(GNO_CHAIN), ['REDUNDANT_CHANGE_REQUEST']), ['REDUNDANT_CHANGE_REQUEST'])
  } else adenaResult(switched, ['REDUNDANT_CHANGE_REQUEST'])
  return readAdenaAccount()
}
export async function adenaCall(expected: string, tx: Parameters<Adena['DoContract']>[0]) {
  const account = await readAdenaAccount()
  if (account.address !== expected) throw new Error('Your Adena account changed. Reconnect and review the transfer again.')
  const result = adenaResult(await window.adena!.DoContract(tx))
  if (!result.hash) throw new Error('Adena did not return a transaction hash.')
  for (const part of [result.checkTx, result.deliverTx]) {
    if (part && typeof part === 'object') {
      const v = part as Record<string, unknown>
      const base = (v.ResponseBase ?? v) as Record<string, unknown>
      if (base.Error || base.error || (base.code !== undefined && base.code !== 0)) throw new Error(`gno VM: ${String(base.Log ?? base.log ?? JSON.stringify(base.Error ?? base.error))}`)
    }
  }
  return result
}

export function discoverWallets(onChange: (options: WalletOption[]) => void): () => void {
  const wallets = new Map<string, WalletOption>()
  const add = (option: WalletOption) => {
    if (!option.provider?.request || [...wallets.values()].some(v => v.provider === option.provider)) return
    wallets.set(option.id, option)
  }
  const scan = () => {
    if (window.keplr?.ethereum) add({ id: 'keplr', name: 'Keplr', provider: window.keplr.ethereum })
    const injected = window.ethereum?.providers ?? (window.ethereum ? [window.ethereum] : [])
    for (const p of injected) {
      if (p.isKeplr) add({ id: 'keplr-injected', name: 'Keplr', provider: p })
      else if (p.isMetaMask) add({ id: 'metamask', name: 'MetaMask', provider: p })
    }
    onChange([...wallets.values()])
  }
  const announce = (event: Event) => {
    const { detail } = event as CustomEvent<{ info: { uuid: string; name: string; rdns: string }; provider: EvmProvider }>
    if (!detail?.info || !detail.provider) return
    if (/metamask|keplr/i.test(detail.info.rdns)) add({ id: detail.info.uuid, name: /keplr/i.test(detail.info.rdns) ? 'Keplr' : 'MetaMask', provider: detail.provider })
    scan()
  }
  window.addEventListener('eip6963:announceProvider', announce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  scan()
  const timer = window.setInterval(scan, 2_000)
  return () => { window.clearInterval(timer); window.removeEventListener('eip6963:announceProvider', announce) }
}
export async function ensureSepolia(provider: EvmProvider): Promise<void> {
  if (BigInt(String(await provider.request({ method: 'eth_chainId' }))) === BigInt(sepolia.id)) return
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }) }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xaa36a7', chainName: 'Sepolia', nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [sepolia.rpcUrls.default.http[0]], blockExplorerUrls: ['https://sepolia.etherscan.io'] }] })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] })
  }
  if (BigInt(String(await provider.request({ method: 'eth_chainId' }))) !== BigInt(sepolia.id)) throw new Error('Switch your Ethereum wallet to Sepolia before continuing.')
}
export async function connectEvm(option: WalletOption): Promise<Address> {
  await ensureSepolia(option.provider)
  const accounts = await option.provider.request({ method: 'eth_requestAccounts' }) as string[]
  if (!accounts?.[0]) throw new Error('The wallet did not share an Ethereum account.')
  return ethereumAddress(accounts[0])
}
export async function assertEvmAccount(option: WalletOption, expected: Address) {
  await ensureSepolia(option.provider)
  const accounts = await option.provider.request({ method: 'eth_accounts' }) as string[]
  if (!accounts[0] || accounts[0].toLowerCase() !== expected.toLowerCase()) throw new Error('Your Ethereum account changed. Reconnect and review the transfer again.')
}
export async function sendEvm(option: WalletOption, account: Address, to: Address, data: Hex): Promise<Hex> {
  await assertEvmAccount(option, account)
  const client = createWalletClient({ account, chain: sepolia, transport: custom(option.provider as EIP1193Provider) })
  return client.sendTransaction({ to, data })
}
