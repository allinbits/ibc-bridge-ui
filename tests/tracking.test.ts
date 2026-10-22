import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ethBalance, publicClient } from '../src/lib/ethereum'
import { getClaims, getSends, gnoBalance, gnoRpc } from '../src/lib/gno'
import { trackEntry } from '../src/lib/tracking'
import type { TransferEntry } from '../src/lib/history'
import type { Claim, Page, SendRecord } from '../src/lib/status'

vi.mock('../src/lib/gno', () => ({ getClaims: vi.fn(), getSends: vi.fn(), gnoBalance: vi.fn(), gnoRpc: vi.fn() }))
vi.mock('../src/lib/ethereum', () => ({ ethBalance: vi.fn(), publicClient: { getBlockNumber: vi.fn(), getTransactionReceipt: vi.fn(), getContractEvents: vi.fn() }, sequenceFromReceipt: vi.fn(() => '3') }))
const fixture = <T>(name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8')) as T
const sends = fixture<Page<SendRecord>>('sends').entries
const claims = fixture<Page<Claim>>('claims').entries
const base: TransferEntry = { id: 'test', direction: 'gno-eth', token: 'GNOT', amount: '5000000', sender: 'g1kg6w7a4f0kup8wj9y33jdkqvvux7n559avyzcs', receiver: '0xE6F1390EF5a96Bb319Cad61B1a448DDc857a0b88', hash: 'gFEUyUMCQlEGmvbBqS1KLGFYGFJUwg5LQOtaP60g5lc=', sequence: '7', created: Date.now(), timeout: '9999999999', ethStartBlock: '11966000', status: 'submitted', detail: '' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(publicClient.getBlockNumber).mockResolvedValue(11966100n)
  vi.mocked(publicClient.getContractEvents).mockResolvedValue([])
  vi.mocked(ethBalance).mockResolvedValue(999999999n)
  vi.mocked(gnoBalance).mockResolvedValue(10000000000000000000n)
  vi.mocked(getSends).mockResolvedValue(sends)
  vi.mocked(getClaims).mockResolvedValue(claims)
})

describe('packet-based transfer tracking', () => {
  it('completes only when the exact gno send has a success acknowledgement', async () => {
    expect((await trackEntry(base)).status).toBe('complete')
    vi.mocked(getSends).mockResolvedValue(sends.map(s => ({ ...s, outcome: '' })))
    const pending = await trackEntry(base)
    expect(pending.status).toBe('relaying')
    expect(pending.destinationBalance).toBe('999999999')
  })
  it('reports a paid error refund and a queued error refund separately', async () => {
    const failed = sends.find(s => s.outcome === 'error')!
    const entry = { ...base, token: 'TERC' as const, amount: failed.amount, sequence: String(failed.packet.sequence) }
    expect((await trackEntry(entry)).status).toBe('refunded')
    vi.mocked(getSends).mockResolvedValue([{ ...failed, payment: 'queued', refunded: '0' }])
    expect((await trackEntry(entry)).status).toBe('refund-pending')
  })
  it('rejects a packet with mismatched amount or recipient', async () => {
    await expect(trackEntry({ ...base, amount: '1' })).rejects.toThrow('does not match')
    await expect(trackEntry({ ...base, receiver: '0x123' })).rejects.toThrow('does not match')
  })
  it('preserves source transaction failure rather than waiting for a send record', async () => {
    vi.mocked(gnoRpc).mockResolvedValue({ result: { height: '1', tx_result: { ResponseBase: { Error: {}, Log: 'panic: insufficient balance' } } } })
    const result = await trackEntry({ ...base, sequence: undefined })
    expect(result.status).toBe('failed')
    expect(result.detail).toContain('insufficient balance')
  })
  it('requires the exact packet claim, and keeps partial payouts claimable', async () => {
    const incoming: TransferEntry = { ...base, direction: 'eth-gno', token: 'TERC', amount: '10000000000000000000', sequence: '3', sender: base.receiver, receiver: base.sender }
    expect((await trackEntry(incoming)).status).toBe('complete')
    vi.mocked(getClaims).mockResolvedValue(claims.map(c => c.key.endsWith('03') ? { ...c, state: 'open', paid: '1000000000000000' } : c))
    expect((await trackEntry(incoming)).status).toBe('claimable')
    vi.mocked(getClaims).mockResolvedValue(claims.filter(c => !c.key.endsWith('03')))
    expect((await trackEntry(incoming)).status).toBe('finalizing')
  })
  it('does not convert an RPC outage into a terminal failure', async () => {
    vi.mocked(getSends).mockRejectedValue(new Error('RPC offline'))
    await expect(trackEntry(base)).rejects.toThrow('RPC offline')
    expect(base.status).toBe('submitted')
  })
})
