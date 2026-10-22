import { describe, expect, it } from 'vitest'
import { encodeErrorResult, getAddress } from 'viem'
import { bech32 } from '@scure/base'
import { readFileSync } from 'node:fs'
import { transferAbi } from '../src/lib/abi'
import { ethereumAddress, validGnoAddress } from '../src/lib/address'
import { formatAmount, parseAmount, quoteTransfer } from '../src/lib/amount'
import { MAX_COIN, MAX_ROUTE_AMOUNT, MAX_UINT256, TOKENS, type Token } from '../src/lib/config'
import { encodeTransfer, sequenceFromReceipt } from '../src/lib/ethereum'
import { explainError } from '../src/lib/errors'
import { allPages, decodeQueryResponse, routeFee, transferMessage } from '../src/lib/gno'
import { claimRemaining, openClaims, packetKey, parseRendered, sendState, type Claim, type Page, type Route, type SendRecord } from '../src/lib/status'
import { claimState, gnoHashBase64, gnoTxInfo } from '../src/lib/tracking'
import { vi } from 'vitest'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const rpc = (name: string) => JSON.parse(fixture(`${name}-rpc.json`)) as unknown
const gno = 'g1kg6w7a4f0kup8wj9y33jdkqvvux7n559avyzcs'
const eth = '0xE6F1390EF5a96Bb319Cad61B1a448DDc857a0b88'

describe('amounts stay exact', () => {
  it.each([[6, '5.000001', 5000001n], [18, '10.000000000000000001', 10000000000000000001n], [18, '0.000000000000000001', 1n]] as const)('parses and formats %s decimals', (decimals, value, expected) => {
    expect(parseAmount(value, decimals)).toBe(expected)
    expect(formatAmount(expected, decimals)).toBe(value)
  })
  it.each(['', '0', '-1', '+1', '1e18', ' 1', '1 ', '1.', '.5', '00.5', '1,000', 'NaN', '0.0000001'])('rejects invalid GNOT amount %s', value => expect(() => parseAmount(value, 6)).toThrow())
  it('supports uint256 and rejects overflow', () => {
    expect(parseAmount(MAX_UINT256.toString(), 0)).toBe(MAX_UINT256)
    expect(() => parseAmount((MAX_UINT256 + 1n).toString(), 0)).toThrow('uint256')
  })
  it('formats without scientific notation, rounding, or trailing zeros', () => {
    expect(formatAmount(10000000000000000000n, 18)).toBe('10')
    expect(formatAmount(0n, 6)).toBe('0')
    expect(formatAmount(MAX_UINT256, 18)).toBe('115792089237316195423570985008687907853269984665640564039457.584007913129639935')
  })
})

describe('addresses', () => {
  it('validates the bech32 checksum and 20-byte payload', () => {
    expect(validGnoAddress(gno)).toBe(true)
    expect(validGnoAddress(gno.slice(0, -1) + 'q')).toBe(false)
    expect(validGnoAddress(gno.toUpperCase())).toBe(false)
    expect(validGnoAddress(bech32.encode('g', bech32.toWords(new Uint8Array(19))))).toBe(false)
    expect(validGnoAddress(bech32.encode('cosmos', bech32.toWords(new Uint8Array(20))))).toBe(false)
  })
  it('normalizes valid lower-case addresses and rejects bad mixed-case checksums', () => {
    expect(ethereumAddress(eth.toLowerCase())).toBe(getAddress(eth.toLowerCase()))
    expect(() => ethereumAddress(eth.replace('E6', 'e6'))).toThrow('checksum')
  })
  it('rejects protected, zero and precompile addresses', () => {
    expect(() => ethereumAddress('0x0000000000000000000000000000000000000000')).toThrow('reserved')
    expect(() => ethereumAddress(TOKENS.TERC.address)).toThrow('contract')
  })
})

describe('fees and MsgCall encoding', () => {
  const liveRoute = parseRendered<Route>(decodeQueryResponse(rpc('route')))
  it('reads the live route fee from tm2 ResponseBase.Data', () => expect(routeFee(liveRoute, 'GNOT')).toBe(1000000n))
  it('sends native amount plus fee without reducing the receiver amount', () => {
    expect(quoteTransfer('gno-eth', 'GNOT', 5000000n, 1000000n)).toEqual({ total: 6000000n, fee: 1000000n, receive: 5000000n, send: '6000000ugnot' })
    const message = transferMessage(gno, eth, 'GNOT', 5000000n, 1000000n, 1792645375n)
    expect(message).toEqual({ messages: [{ type: '/vm.m_call', value: { caller: gno, send: '6000000ugnot', pkg_path: 'gno.land/r/aib/ibc/apps/transfer', func: 'Transfer', args: ['ethereum-1', eth, 'ugnot', '5000000', '1792645375', ''] } }] })
    // The captured successful transaction actually debited 6,000,000 ugnot.
    const tx = rpc('tx') as { result: { tx_result: { ResponseBase: { Events: { coins?: string }[] } } } }
    expect(tx.result.tx_result.ResponseBase.Events[0].coins).toBe(message.messages[0].value.send)
  })
  it('does not send coins or deduct a fee on TERC voucher returns', () => {
    const quote = quoteTransfer('gno-eth', 'TERC', 10n ** 19n, routeFee(liveRoute, 'TERC'))
    expect(quote).toEqual({ total: 10n ** 19n, fee: 0n, receive: 10n ** 19n, send: '' })
    expect(transferMessage(gno, eth, 'TERC', 10n ** 19n, 10n ** 15n, 1792645375n).messages[0].value.send).toBe('')
  })
  it('deducts incoming fees only at claim', () => expect(quoteTransfer('eth-gno', 'GNOT', 5000000n, 1000000n)).toEqual({ total: 5000000n, fee: 1000000n, receive: 4000000n, send: '' }))
  it('enforces route uint96, native int64, and claim fee limits', () => {
    expect(() => quoteTransfer('gno-eth', 'TERC', MAX_ROUTE_AMOUNT + 1n, 0n)).toThrow('2^96')
    expect(() => quoteTransfer('gno-eth', 'GNOT', MAX_COIN, 1n)).toThrow('coin limit')
    expect(() => quoteTransfer('eth-gno', 'GNOT', 10n, 10n)).toThrow('claim fee')
    expect(quoteTransfer('gno-eth', 'TERC', MAX_ROUTE_AMOUNT, 99n).total).toBe(MAX_ROUTE_AMOUNT)
  })
})

describe('Ethereum ABI matches Go reference', () => {
  const vectors = JSON.parse(fixture('send-transfer-vectors.json')) as { token: Token; amount: string; receiver: string; timeout: string; calldata: string }[]
  it.each(vectors)('encodes $token byte for byte with go-ethereum abi.Pack', vector => {
    expect(encodeTransfer(vector.token, BigInt(vector.amount), vector.receiver, BigInt(vector.timeout))).toBe(vector.calldata)
  })
  it.each(['GnoLimitsNotSet', 'GnoEscrowReserved', 'GnoSendAboveMax', 'GnoSendBelowMin', 'GnoRoutePaused', 'GnoQuarantined'])('explains %s by name', name => expect(explainError(new Error(name))).toContain(name))
  it('decodes nested revert bytes and preserves uint256 arguments', () => {
    const data = encodeErrorResult({ abi: transferAbi, errorName: 'GnoSendAboveMax', args: [TOKENS.TERC.address, 10n ** 19n, 10n ** 18n] })
    expect(explainError({ cause: { data } })).toContain('10000000000000000000')
    expect(explainError({ cause: { data } })).toContain('maximum per transfer')
  })
  it('distinguishes Adena failures from wallet rejections', () => {
    expect(explainError({ code: 4001, type: 'TRANSACTION_FAILED', message: 'VM panic: insufficient funds' })).toContain('panic')
    expect(explainError({ code: 4000, type: 'TRANSACTION_REJECTED' })).toContain('cancelled')
    expect(explainError({ code: 4001, message: 'User denied' })).toContain('cancelled')
  })
})

describe('live status parsing', () => {
  it('decodes native and voucher balances without rounding', () => {
    expect(parseRendered<string>(decodeQueryResponse(rpc('bank')))).toMatch(/^\d+ugnot$/)
    expect(parseRendered<{ balance: string }>(decodeQueryResponse(rpc('voucher-balance'))).balance).toBe('10000000000000000000')
  })
  it('reads packet sequence from a successful live tx event', () => {
    expect(gnoTxInfo(rpc('tx'))).toEqual({ height: '27993', sequence: '7' })
    expect(gnoHashBase64('805114c943024251069af6c1a92d4a2c6158185254c20e4b40eb5a3fad20e657')).toBe('gFEUyUMCQlEGmvbBqS1KLGFYGFJUwg5LQOtaP60g5lc=')
  })
  it('reads the Ethereum packet sequence from the live router SendPacket log', () => {
    const receipt = JSON.parse(fixture('eth-receipt.json')) as { logs: Parameters<typeof sequenceFromReceipt>[0] }
    expect(sequenceFromReceipt(receipt.logs)).toBe('3')
  })
  it('keeps large packet sequences exact', () => {
    const value = parseRendered<{ packet: { sequence: string } }>('{"packet":{"sequence":18446744073709551615}}')
    expect(value.packet.sequence).toBe('18446744073709551615')
    expect(packetKey(value.packet.sequence)).toBe('ethereum-1/18446744073709551615')
  })
  it('distinguishes success, full refund and queued refund using live sends', () => {
    const entries = parseRendered<Page<SendRecord>>(decodeQueryResponse(rpc('sends'))).entries
    expect(sendState(entries.find(e => e.outcome === 'success')!).status).toBe('complete')
    const refunded = entries.find(e => e.outcome === 'error')!
    expect(sendState(refunded).status).toBe('refunded')
    expect(sendState({ ...refunded, payment: 'queued', refunded: '0' }).status).toBe('refund-pending')
  })
  it('handles open and partially paid claims without treating them as complete', () => {
    const claim = parseRendered<Page<Claim>>(decodeQueryResponse(rpc('claims'))).entries[0]
    expect(claimState(claim).status).toBe('complete')
    const partial = { ...claim, state: 'open', paid: '1000000' }
    expect(claimRemaining(partial)).toBe(4000000n)
    expect(openClaims([partial, claim], gno)).toEqual([partial])
    expect(claimState(partial).status).toBe('claimable')
  })
  it('surfaces RPC and VM errors instead of inventing a zero balance', () => {
    expect(() => decodeQueryResponse({ error: { message: 'unavailable' } })).toThrow('unavailable')
    expect(() => decodeQueryResponse({ result: { response: { ResponseBase: { Error: {}, Log: 'panic: stopped' } } } })).toThrow('stopped')
  })
  it('follows pagination, including URL-escaped cursors', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { params: { data: string } }
      const nextPage = atob(request.params.data).includes('?from=')
      const data = JSON.stringify(nextPage ? { entries: [2], next: '' } : { entries: [1], next: 'ethereum-1/00000000000000000002' })
      return new Response(JSON.stringify({ result: { response: { ResponseBase: { Data: btoa(data), Error: null } } } }))
    })
    try { expect(await allPages<number>('routes/ethereum-1/claims')).toEqual([1, 2]); expect(mock).toHaveBeenCalledTimes(2) }
    finally { mock.mockRestore() }
  })
})
