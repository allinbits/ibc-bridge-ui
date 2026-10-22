import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeFunctionData, type Hex } from 'viem'
import { erc20Abi } from '../src/lib/abi'
import { TOKENS, TRANSFER } from '../src/lib/config'
import { approveIfNeeded, publicClient } from '../src/lib/ethereum'
import { sendEvm, type WalletOption } from '../src/lib/wallets'

vi.mock('../src/lib/wallets', () => ({ sendEvm: vi.fn() }))
const address = '0xE6F1390EF5a96Bb319Cad61B1a448DDc857a0b88'
const hash = `0x${'a'.repeat(64)}` as Hex
const wallet: WalletOption = { id: 'keplr', name: 'Keplr', provider: { request: async () => null } }
afterEach(() => vi.restoreAllMocks())

describe('ERC20 allowances, including burned GNOT vouchers', () => {
  it.each(['GNOT', 'TERC'] as const)('approves the exact %s amount before transfer', async token => {
    vi.spyOn(publicClient, 'readContract').mockResolvedValue(0n)
    vi.mocked(sendEvm).mockResolvedValue(hash)
    vi.spyOn(publicClient, 'waitForTransactionReceipt').mockResolvedValue({ status: 'success' } as Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>)
    const onHash = vi.fn()
    await approveIfNeeded(wallet, address, token, 10000000000000000000n, onHash)
    expect(onHash).toHaveBeenCalledWith(hash)
    const [, signer, to, data] = vi.mocked(sendEvm).mock.calls.at(-1)!
    expect(signer).toBe(address)
    expect(to).toBe(TOKENS[token].address)
    expect(decodeFunctionData({ abi: erc20Abi, data }).args).toEqual([TRANSFER, 10000000000000000000n])
  })
  it('reuses an existing allowance', async () => {
    vi.spyOn(publicClient, 'readContract').mockResolvedValue(100n)
    vi.mocked(sendEvm).mockClear()
    await approveIfNeeded(wallet, address, 'GNOT', 100n, vi.fn())
    expect(sendEvm).not.toHaveBeenCalled()
  })
  it('does not proceed when the approval receipt reverts', async () => {
    vi.spyOn(publicClient, 'readContract').mockResolvedValue(0n)
    vi.mocked(sendEvm).mockResolvedValue(hash)
    vi.spyOn(publicClient, 'waitForTransactionReceipt').mockResolvedValue({ status: 'reverted' } as Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>)
    await expect(approveIfNeeded(wallet, address, 'TERC', 100n, vi.fn())).rejects.toThrow('approval transaction reverted')
  })
})
