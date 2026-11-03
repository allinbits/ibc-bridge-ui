import { afterEach, describe, expect, it, vi } from 'vitest'
import { GNO_RPC } from '../src/lib/config'
import { adenaCall, connectAdena, connectEvm, ensureEvmChain, type Adena, type AdenaResponse, type EvmProvider } from '../src/lib/wallets'
import { loadHistory, saveEntry, type TransferEntry } from '../src/lib/history'

const gno = 'g1kg6w7a4f0kup8wj9y33jdkqvvux7n559avyzcs'
const eth = '0xE6F1390EF5a96Bb319Cad61B1a448DDc857a0b88'
const ok = <T>(data: T): AdenaResponse<T> => ({ data, code: 0, status: 'success', message: '', type: 'OK' })
const failure = (type: string): AdenaResponse => ({ data: {}, code: 4001, status: 'failure', message: type, type })
function adena(): Adena {
  return { AddEstablish: vi.fn(async () => ok({})), GetAccount: vi.fn(async () => ok({ address: gno, chainId: 'test-ibc-1' })), SwitchNetwork: vi.fn(async () => ok({})), AddNetwork: vi.fn(async () => ok({})), DoContract: vi.fn(async () => ok({ hash: 'gFEUyUMCQlEGmvbBqS1KLGFYGFJUwg5LQOtaP60g5lc=' })) }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Adena adapter', () => {
  it('adds the custom chain only when missing and switches before reading the account', async () => {
    const wallet = adena()
    vi.mocked(wallet.SwitchNetwork).mockResolvedValueOnce(failure('UNADDED_NETWORK'))
    vi.stubGlobal('window', { adena: wallet })
    expect((await connectAdena()).address).toBe(gno)
    expect(wallet.AddEstablish).toHaveBeenCalledWith('gno.land Bridge')
    expect(wallet.AddNetwork).toHaveBeenCalledWith({ chainId: 'test-ibc-1', chainName: 'gno.land · test-ibc-1', rpcUrl: GNO_RPC })
    expect(wallet.SwitchNetwork).toHaveBeenCalledTimes(2)
  })
  it('handles rejected already-connected and missing-network envelopes', async () => {
    const wallet = adena()
    vi.mocked(wallet.AddEstablish).mockRejectedValueOnce(failure('ALREADY_CONNECTED'))
    vi.mocked(wallet.SwitchNetwork).mockRejectedValueOnce(failure('UNADDED_NETWORK'))
    vi.stubGlobal('window', { adena: wallet })
    expect((await connectAdena()).chainId).toBe('test-ibc-1')
  })
  it('does not request network addition after a user rejection', async () => {
    const wallet = adena()
    vi.mocked(wallet.SwitchNetwork).mockResolvedValueOnce({ ...failure('SWITCH_NETWORK_REJECTED'), code: 4000 })
    vi.stubGlobal('window', { adena: wallet })
    await expect(connectAdena()).rejects.toMatchObject({ type: 'SWITCH_NETWORK_REJECTED' })
    expect(wallet.AddNetwork).not.toHaveBeenCalled()
  })
  it('checks the live chain and account again before signing', async () => {
    const wallet = adena()
    vi.stubGlobal('window', { adena: wallet })
    await expect(adenaCall('g1wrong', { messages: [] })).rejects.toThrow('account changed')
    vi.mocked(wallet.GetAccount).mockResolvedValueOnce(ok({ address: gno, chainId: 'wrong-chain' }))
    await expect(adenaCall(gno, { messages: [] })).rejects.toThrow('test-ibc-1')
    expect(wallet.DoContract).not.toHaveBeenCalled()
  })
  it('surfaces deliverTx panics returned by a wallet', async () => {
    const wallet = adena()
    vi.mocked(wallet.DoContract).mockResolvedValueOnce(ok({ hash: 'hash', deliverTx: { ResponseBase: { Error: {}, Log: 'panic: route paused' } } }))
    vi.stubGlobal('window', { adena: wallet })
    await expect(adenaCall(gno, { messages: [] })).rejects.toThrow('route paused')
  })
})

describe('EIP-1193 adapter (MetaMask and Keplr)', () => {
  it('switches to Sepolia and requests an account from the selected provider', async () => {
    let chain = '0x1'
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => {
      if (method === 'eth_chainId') return chain
      if (method === 'wallet_switchEthereumChain') { chain = '0xaa36a7'; return null }
      if (method === 'eth_requestAccounts') return [eth]
      throw new Error('Unexpected method')
    }) }
    expect(await connectEvm({ id: 'keplr', name: 'Keplr', provider })).toBe(eth)
    expect(provider.request).toHaveBeenCalledWith({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] })
  })
  it('adds an unknown Sepolia chain, then switches and verifies it', async () => {
    let added = false
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => {
      if (method === 'eth_chainId') return added ? '0xaa36a7' : '0x1'
      if (method === 'wallet_switchEthereumChain' && !added) throw { code: 4902 }
      if (method === 'wallet_addEthereumChain') added = true
      return null
    }) }
    await ensureEvmChain(provider)
    expect(added).toBe(true)
  })
  it('does not add a chain if switching was rejected', async () => {
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => { if (method === 'eth_chainId') return '0x1'; throw { code: 4001 } }) }
    await expect(ensureEvmChain(provider)).rejects.toMatchObject({ code: 4001 })
    expect(provider.request).toHaveBeenCalledTimes(2)
  })
})

describe('per-wallet persistence', () => {
  const entry: TransferEntry = { id: 'test', direction: 'gno-eth', token: 'TERC', amount: '10000000000000000000', sender: gno, receiver: eth, created: 100, timeout: '1792645375', status: 'submitted', detail: 'pending', hash: 'gFEUyUMCQlEGmvbBqS1KLGFYGFJUwg5LQOtaP60g5lc=' }
  const setup = () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) })
    return items
  }
  it('indexes both participants, deduplicates and isolates unrelated wallets', () => {
    setup()
    expect(saveEntry(entry)).toBe(true)
    expect(loadHistory([gno, eth])).toEqual([entry])
    expect(loadHistory([eth.toLowerCase()])).toEqual([entry])
    expect(loadHistory(['unrelated'])).toEqual([])
    saveEntry({ ...entry, updated: 101, status: 'complete' })
    expect(loadHistory([gno])[0].status).toBe('complete')
  })
  it('recovers an interrupted approval without calling it a bridge transfer', () => {
    setup()
    saveEntry({ ...entry, hash: undefined, approvalHash: '0x123', status: 'approving' })
    expect(loadHistory([eth])[0].status).toBe('approval-only')
  })
  it('tolerates disabled storage and corrupt entries', () => {
    const items = setup()
    items.set(`gno-bridge:v1:${gno}`, '[{"bad":true}]')
    expect(loadHistory([gno])).toEqual([])
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(saveEntry(entry)).toBe(false)
    expect(loadHistory([gno])).toEqual([])
  })
})
