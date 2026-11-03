import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { decodeFunctionData, type Hex } from 'viem'
import App from '../src/App'
import { erc20Abi, transferAbi } from '../src/lib/abi'
import { ethereumAddress } from '../src/lib/address'
import { formatAmount, parseAmount, quoteTransfer } from '../src/lib/amount'
import { EVM_CHAIN, GNO_CLIENT, GNO_RPC, ROUTE, ROUTER, TOKENS, TRANSFER } from '../src/lib/config'
import { approveIfNeeded, encodeTransfer, publicClient, reservedToken } from '../src/lib/ethereum'
import * as gnoApi from '../src/lib/gno'
import { explainError } from '../src/lib/errors'
import { loadHistory, saveEntry, type TransferEntry } from '../src/lib/history'
import { packetKey, type SendRecord } from '../src/lib/status'
import { gnoTxInfo, recordUrl, trackEntry, transactionUrl } from '../src/lib/tracking'
import { connectAdena, connectEvm, ensureEvmChain, sendEvm, type EvmProvider, type WalletOption } from '../src/lib/wallets'

vi.mock('virtual:bridge-route', async () => {
  const { arcRoute, voucherDenom } = await import('../src/lib/routes')
  const { default: deployment } = await import('./fixtures/arc-deployment.json')
  const route = arcRoute(deployment)
  const address = '0x6666666666666666666666666666666666666666'
  return { default: arcRoute({ ...deployment, tokens: { ...route.tokens, TST: { symbol: 'TST', address, decimals: 18, denom: voucherDenom('arc-1', address) } } }) }
})

const gno = 'g1kg6w7a4f0kup8wj9y33jdkqvvux7n559avyzcs'
const eth = '0xE6F1390EF5a96Bb319Cad61B1a448DDc857a0b88'
const hash = `0x${'a'.repeat(64)}` as Hex
const entry: TransferEntry = { id: 'arc-test', direction: 'eth-gno', token: 'USDC', amount: '5000000', sender: eth, receiver: gno, hash, sequence: '1', created: 1, timeout: '9999999999', ethStartBlock: '1', status: 'submitted', detail: '' }
beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Arc wallet adapters', () => {
  it.each(['MetaMask', 'Keplr'])('adds and verifies Arc in %s with native USDC at 18 decimals', async name => {
    let chain = '0x1'
    let added = false
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => {
      if (method === 'eth_chainId') return chain
      if (method === 'eth_requestAccounts') return [eth]
      if (method === 'wallet_switchEthereumChain') {
        if (!added) throw { code: 4902 }
        chain = '0x4cef52'
      }
      if (method === 'wallet_addEthereumChain') added = true
      return null
    }) }
    expect(await connectEvm({ id: name, name, provider })).toBe(eth)
    expect(provider.request).toHaveBeenCalledWith({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x4cef52', chainName: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: ['https://rpc.testnet.arc.io'], blockExplorerUrls: ['https://testnet.arcscan.app'] }] })
    expect(provider.request).toHaveBeenCalledWith({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4cef52' }] })
  })
  it('rejects a wallet that stays on the wrong chain', async () => {
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x1' : null) }
    await expect(ensureEvmChain(provider)).rejects.toThrow('Arc Testnet')
  })
  it('adds the separate Adena custom network and rejects a Sepolia-side gno account', async () => {
    const ok = (data = {}) => ({ data, status: 'success', type: 'OK', code: 0, message: '' })
    const adena = {
      AddEstablish: vi.fn(async () => ok()), AddNetwork: vi.fn(async () => ok()),
      SwitchNetwork: vi.fn().mockResolvedValueOnce({ status: 'failure', type: 'UNADDED_NETWORK' }).mockResolvedValue(ok()),
      GetAccount: vi.fn(async () => ok({ address: gno, chainId: 'test-arc-1' })),
    }
    vi.stubGlobal('window', { adena })
    expect((await connectAdena()).chainId).toBe('test-arc-1')
    expect(adena.AddNetwork).toHaveBeenCalledWith({ chainId: 'test-arc-1', chainName: 'gno.land · test-arc-1', rpcUrl: GNO_RPC })
    adena.GetAccount.mockResolvedValueOnce(ok({ address: gno, chainId: 'test-ibc-1' }))
    await expect(connectAdena()).rejects.toThrow('Switch Adena to test-arc-1')
  })
  it('signs EVM transactions for Arc without sending native USDC as token value', async () => {
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => {
      if (method === 'eth_chainId') return '0x4cef52'
      if (method === 'eth_accounts') return [eth]
      if (method === 'eth_sendTransaction') return hash
      throw new Error(`Unexpected wallet method: ${method}`)
    }) }
    const data = encodeTransfer('USDC', 5000000n, gno, 9999999999n)
    expect(await sendEvm({ id: 'metamask', name: 'MetaMask', provider }, eth, TRANSFER, data)).toBe(hash)
    const request = vi.mocked(provider.request).mock.calls.find(([args]) => args.method === 'eth_sendTransaction')![0]
    expect(request.params![0]).toMatchObject({ from: eth, to: TRANSFER, data })
    expect(request.params![0]).not.toHaveProperty('value')
  })
})

describe('Arc transfer amounts and tokens', () => {
  it.each(['GNOT', 'USDC', 'TST'])('uses configured %s units and client ids in both directions', token => {
    const amount = parseAmount('5', TOKENS[token].decimals)
    const tx = gnoApi.transferMessage(gno, eth, token, amount, 100n, 9999999999n).messages[0].value
    expect(tx.args).toEqual(['arc-1', eth, TOKENS[token].denom, amount.toString(), '9999999999', ''])
    expect(tx.send).toBe(token === 'GNOT' ? '5000100ugnot' : '')
    expect(quoteTransfer('gno-eth', token, amount, 100n).fee).toBe(token === 'GNOT' ? 100n : 0n)
    expect(quoteTransfer('eth-gno', token, amount, 100n).receive).toBe(amount - 100n)
    const decoded = decodeFunctionData({ abi: transferAbi, data: encodeTransfer(token, amount, gno, 9999999999n) })
    expect(decoded.args![0]).toMatchObject({ sourceClient: 'client-0', denom: TOKENS[token].address, amount })
  })
  it('uses 6 decimal ERC20 USDC amounts and the Arc public client', () => {
    expect(parseAmount('1.000001', TOKENS.USDC.decimals)).toBe(1000001n)
    expect(formatAmount(1000001n, TOKENS.USDC.decimals)).toBe('1.000001')
    expect(() => parseAmount('1.0000001', TOKENS.USDC.decimals)).toThrow('6 decimal')
    expect(publicClient.chain.id).toBe(5042002)
    expect(EVM_CHAIN.nativeCurrency.decimals).toBe(18)
  })
  it.each(['GNOT', 'USDC'])('approves the exact %s ERC20 amount', async token => {
    vi.spyOn(publicClient, 'readContract').mockResolvedValue(0n)
    vi.spyOn(publicClient, 'waitForTransactionReceipt').mockResolvedValue({ status: 'success' } as Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>)
    const provider: EvmProvider = { request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x4cef52' : method === 'eth_accounts' ? [eth] : hash) }
    const wallet: WalletOption = { id: 'keplr', name: 'Keplr', provider }
    const onHash = vi.fn()
    await approveIfNeeded(wallet, eth, token, 5000000n, onHash)
    expect(onHash).toHaveBeenCalledWith(hash)
    const transaction = vi.mocked(provider.request).mock.calls.find(([args]) => args.method === 'eth_sendTransaction')![0].params![0] as { to: string; data: Hex }
    expect(transaction.to).toBe(TOKENS[token].address)
    expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args).toEqual([TRANSFER, 5000000n])
  })
  it('reads USDC escrow reservations using the configured contract and token', async () => {
    const read = vi.spyOn(publicClient, 'readContract').mockResolvedValue(99n)
    expect(await reservedToken('USDC')).toBe(99n)
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ address: TRANSFER, functionName: 'reserved', args: ['client-0', TOKENS.USDC.address] }))
    expect(explainError(new Error('GnoEscrowReserved'))).toContain('normally seconds')
  })
  it('queries vouchers for all EVM-native tokens and includes arc-1 in route queries', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ result: { response: { ResponseBase: { Data: btoa('{"balance":"1000001"}') } } } })))
    expect(await gnoApi.gnoBalance('USDC', gno)).toBe(1000001n)
    expect(fetch.mock.calls[0][0]).toBe('https://rpc-2.2-29-108-12.sslip.io')
    const body = JSON.parse(String(fetch.mock.calls[0][1]!.body))
    expect(atob(body.params.data)).toBe(`gno.land/r/aib/ibc/apps/transfer:voucher/${TOKENS.USDC.denom}/balance/${gno}`)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ result: { response: { ResponseBase: { Data: btoa('{"client":"arc-1","denoms":[]}') } } } })))
    expect((await gnoApi.route()).client).toBe('arc-1')
    expect(atob(JSON.parse(String(fetch.mock.calls[1][1]!.body)).params.data)).toBe('gno.land/r/aib/ibc/apps/transfer:routes/arc-1')
  })
  it('rejects all configured bridge and token contracts as recipients', () => {
    expect(ethereumAddress(eth)).toBe(eth)
    for (const address of [...Object.values(ROUTE.contracts), ...Object.values(TOKENS).map(t => t.address)]) expect(() => ethereumAddress(address)).toThrow('wallet address')
  })
})

describe('Arc packet tracking and presentation', () => {
  it('uses Arc packet keys, event client ids, explorers, and gnoweb links', () => {
    expect(GNO_CLIENT).toBe('arc-1')
    expect(packetKey('18446744073709551615')).toBe('arc-1/18446744073709551615')
    expect(gnoTxInfo({ result: { height: '123', tx_result: { ResponseBase: { Events: [{ type: 'send_packet', attrs: [{ key: 'packet_source_client', value: 'arc-1' }, { key: 'packet_sequence', value: '7' }] }] } } } })).toEqual({ height: '123', sequence: '7' })
    expect(transactionUrl(hash, 'eth')).toBe(`https://testnet.arcscan.app/tx/${hash}`)
    expect(recordUrl(entry)).toContain('https://gnoweb-2.2-29-108-12.sslip.io/r/aib/ibc/apps/transfer:routes/arc-1/claims')
  })
  it('waits for the matching Arc claim without reporting an Ethereum finality wait', async () => {
    vi.spyOn(gnoApi, 'getClaims').mockResolvedValue([])
    vi.spyOn(publicClient, 'getBlockNumber').mockResolvedValue(2n)
    vi.spyOn(publicClient, 'getContractEvents').mockResolvedValue([])
    const pending = await trackEntry(entry)
    expect(pending.status).toBe('relaying')
    expect(pending.detail).toContain('relay (seconds)')
    expect(pending.detail).not.toMatch(/finality|15|20|Sepolia/)
    vi.mocked(gnoApi.getClaims).mockResolvedValue([{ key: packetKey('1'), to: gno, denom: TOKENS.USDC.denom, amount: '5000000', paid: '0', reduced: '0', fee: '100', state: 'open', at: 1 }])
    vi.spyOn(gnoApi, 'gnoBalance').mockResolvedValue(0n)
    expect((await trackEntry(entry)).status).toBe('claimable')
  })
  it('requires the exact Arc send acknowledgement before completing an outbound transfer', async () => {
    const outgoing: TransferEntry = { ...entry, direction: 'gno-eth', sender: gno, receiver: eth }
    const send: SendRecord = { key: packetKey('1'), sender: gno, receiver: eth, denom: TOKENS.USDC.denom, amount: '5000000', fee: '0', sent_height: '1', outcome: 'success', payment: '', refunded: '0', packet: { sequence: '1', timeout_timestamp: '9999999999' } }
    vi.spyOn(gnoApi, 'getSends').mockResolvedValue([send])
    vi.spyOn(publicClient, 'readContract').mockResolvedValue(5000000n)
    const complete = await trackEntry(outgoing)
    expect(complete.status).toBe('complete')
    expect(complete.detail).toContain('Delivered on Arc;')
    vi.mocked(gnoApi.getSends).mockResolvedValue([{ ...send, outcome: '' }])
    vi.spyOn(publicClient, 'getBlockNumber').mockResolvedValue(2n)
    vi.spyOn(publicClient, 'getContractEvents').mockResolvedValue([])
    expect((await trackEntry(outgoing)).detail).toContain('(seconds)')
  })
  it('isolates Arc history from Sepolia and accepts configured tokens', () => {
    const items = new Map<string, string>([[`gno-bridge:v1:${gno}`, JSON.stringify([{ ...entry, token: 'GNOT', id: 'sepolia' }])]])
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) })
    expect(loadHistory([gno])).toEqual([])
    saveEntry(entry)
    saveEntry({ ...entry, id: 'test-token', token: 'TST' })
    expect(loadHistory([gno, eth]).map(e => e.token)).toEqual(['TST', 'USDC'])
    expect(items.has(`gno-bridge:v1:arc:test-arc-1:${gno}`)).toBe(true)
  })
  it('renders Arc tokens, faucet links, fast timing and contract links without Sepolia copy', () => {
    const html = renderToStaticMarkup(createElement(App))
    expect(html).toContain('test-arc-1')
    expect(html).toContain('<option>USDC</option>')
    expect(html).toContain('<option>TST</option>')
    expect(html).toContain('https://faucet.circle.com')
    expect(html).toContain('https://faucet-2.2-29-108-12.sslip.io')
    expect(html).toContain(`${ROUTE.evm.explorer}/address/${TRANSFER}`)
    expect(html).toContain('Seconds')
    expect(html).not.toMatch(/TERC|Sepolia|test-ibc-1|ethereum-1|15–20|~15|~20|Mint test USDC/)
    expect(ROUTER).toBe(ROUTE.contracts.ics26Router)
  })
})
