import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EVM_CHAIN, GNO_CHAIN, GNO_CLIENT, GNO_RPC, ORIGIN, ROUTER, TOKEN_IDS, TOKENS, TRANSFER } from '../src/lib/config'
import { ARC_USDC, arcRoute, selectRoute, SEPOLIA_ROUTE, voucherDenom } from '../src/lib/routes'
import deployment from './fixtures/arc-deployment.json'

describe('build route selection', () => {
  it('keeps the deployed Sepolia defaults', () => {
    expect(selectRoute()).toBe(SEPOLIA_ROUTE)
    expect(selectRoute('sepolia')).toBe(SEPOLIA_ROUTE)
    expect([ORIGIN, GNO_CHAIN, GNO_RPC, GNO_CLIENT, EVM_CHAIN.id]).toEqual(['https://bridge.2-29-108-12.sslip.io', 'test-ibc-1', 'https://rpc.2-29-108-12.sslip.io', 'ethereum-1', 11155111])
    expect([ROUTER, TRANSFER, TOKENS.GNOT.address, TOKENS.TERC.address]).toEqual(['0x6a1E8C6F167006dE6d95fE05e930765d0EA9f49d', '0xe44499e840797B6b452f074100BC66030dBf69F5', '0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212', '0xBb30A5eEC397174d5DA58C4D180459DA51114988'])
    expect(TOKEN_IDS).toEqual(['GNOT', 'TERC'])
    expect(TOKENS.TERC.decimals).toBe(18)
    expect(SEPOLIA_ROUTE.timing.incoming).toBe('15–20 min + Claim')
  })
  it('rejects unknown routes and an Arc build without addresses', () => {
    expect(() => selectRoute('typo')).toThrow('Unknown bridge route')
    expect(() => selectRoute('arc')).toThrow('VITE_BRIDGE_CONFIG')
    expect(() => arcRoute({ ...deployment, ics20Transfer: '0x' + '0'.repeat(40) })).toThrow('ics20Transfer')
    expect(() => arcRoute({ ...deployment, ugnotVoucher: undefined })).toThrow('ugnotVoucher')
  })
  it.each(['chainId', 'gnoChainId', 'counterpartyClientId', 'clientId'])('rejects a mismatched %s', key => {
    expect(() => arcRoute({ ...deployment, [key]: 'wrong' })).toThrow(key)
  })
  it('maps the deployment and distinguishes native gas from ERC20 USDC', () => {
    const route = selectRoute('arc', deployment)
    expect(route.gno).toEqual({ chainId: 'test-arc-1', clientId: 'arc-1', rpc: 'https://rpc-2.2-29-108-12.sslip.io', web: 'https://gnoweb-2.2-29-108-12.sslip.io', faucet: 'https://faucet-2.2-29-108-12.sslip.io' })
    expect(route.origin).toBe('https://bridge-2.2-29-108-12.sslip.io')
    expect(route.evm.chainId.toString(16)).toBe('4cef52')
    expect(route.evm.nativeCurrency).toEqual({ name: 'USDC', symbol: 'USDC', decimals: 18 })
    expect(route.evm.rpc).toBe('https://rpc.testnet.arc.io')
    expect(route.evm.explorer).toBe('https://testnet.arcscan.app')
    expect(route.contracts.ics26Router).toBe(deployment.ics26Router)
    expect(route.contracts.ics20Transfer).toBe(deployment.ics20Transfer)
    expect(route.tokens.GNOT).toMatchObject({ address: deployment.ugnotVoucher, denom: 'ugnot', decimals: 6 })
    const hash = createHash('sha256').update(`transfer/arc-1/${ARC_USDC}`).digest('hex').toUpperCase()
    expect(route.tokens.USDC).toEqual({ symbol: 'USDC', address: ARC_USDC, decimals: 6, denom: `ibc/${hash}` })
    expect(route.faucet.url).toBe('https://faucet.circle.com')
    expect(JSON.stringify(route.timing)).not.toMatch(/minutes|min\)|15|20|Sepolia|Ethereum/)
    expect(voucherDenom('ethereum-1', TOKENS.TERC.address)).toBe(TOKENS.TERC.denom)
  })
  it('supports another configured ERC20 and rejects incorrect denoms or decimals', () => {
    const tokens = arcRoute(deployment).tokens
    const address = '0x6666666666666666666666666666666666666666'
    const TST = { symbol: 'TST', address, decimals: 18, denom: voucherDenom('arc-1', address) }
    expect(Object.keys(arcRoute({ ...deployment, tokens: { ...tokens, TST } }).tokens)).toEqual(['GNOT', 'USDC', 'TST'])
    expect(() => arcRoute({ ...deployment, tokens: { ...tokens, USDC: { ...tokens.USDC, decimals: 18 } } })).toThrow('6 decimals')
    expect(() => arcRoute({ ...deployment, tokens: { ...tokens, TST: { ...TST, denom: 'ibc/wrong' } } })).toThrow('Invalid denom')
    expect(() => arcRoute({ ...deployment, tokens: { ...tokens, TST: { ...TST, decimals: -1 } } })).toThrow('Invalid decimals')
  })
  it('generates a validated, reviewable config from deployment JSON without overwriting a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-arc-config-'))
    try {
      const output = join(dir, 'arc.local.json')
      const args = ['--experimental-strip-types', 'scripts/config-arc.mjs', 'tests/fixtures/arc-deployment.json', output]
      execFileSync(process.execPath, args)
      expect(arcRoute(JSON.parse(readFileSync(output, 'utf8')))).toEqual(arcRoute(deployment))
      expect(spawnSync(process.execPath, args).status).not.toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
