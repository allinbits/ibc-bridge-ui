import { getAddress, isAddress, sha256, stringToHex, type Address } from 'viem'
import { sepolia } from 'viem/chains'

export interface BridgeToken {
  symbol: string
  decimals: number
  denom: string
  address: Address
  mint?: { amount: string; label: string }
}
export interface BridgeRoute {
  id: 'sepolia' | 'arc'
  origin: string
  gno: { chainId: string; rpc: string; web: string; clientId: string; faucet: string }
  evm: {
    chainId: number; name: string; label: string; family: string; rpc: string; walletRpc: string
    nativeCurrency: { name: string; symbol: string; decimals: number }; explorer: string; clientId: string
  }
  contracts: { ics26Router: Address; ics20Transfer: Address; ugnotVoucher: Address; gnoLightClient?: Address; ibcAdmin?: Address }
  tokens: Record<string, BridgeToken>
  faucet: { url: string; label: string; detail: string }
  timing: {
    outbound: string; incoming: string; banner: string; outboundNote: string; incomingNote: string
    emptyClaims: string; pendingSend: string; delivered: string; pendingIncoming: string; escrowError: string
  }
}

export const SEPOLIA_ROUTE: BridgeRoute = {
  id: 'sepolia', origin: 'https://bridge.2-29-108-12.sslip.io',
  gno: { chainId: 'test-ibc-1', rpc: 'https://rpc.2-29-108-12.sslip.io', web: 'https://gnoweb.2-29-108-12.sslip.io', clientId: 'ethereum-1', faucet: 'https://faucet.2-29-108-12.sslip.io' },
  evm: {
    chainId: sepolia.id, name: 'Sepolia', label: 'Ethereum Sepolia', family: 'Ethereum', rpc: 'https://rpc.sepolia.ethpandaops.io',
    walletRpc: sepolia.rpcUrls.default.http[0], nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorer: 'https://sepolia.etherscan.io', clientId: 'client-0',
  },
  contracts: {
    ics26Router: '0x6a1E8C6F167006dE6d95fE05e930765d0EA9f49d', ics20Transfer: '0xe44499e840797B6b452f074100BC66030dBf69F5',
    ugnotVoucher: '0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212',
    ibcAdmin: '0x3D8B06752b98A3D5ee5368870174B278Cc7a1442',
  },
  tokens: {
    GNOT: { symbol: 'GNOT', decimals: 6, denom: 'ugnot', address: '0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212' },
    TERC: { symbol: 'TERC', decimals: 18, denom: 'ibc/F7F044B527F1D7A9301210CB2F71A567B4FEA33C96B2CA56CB7D443AA3984D0C', address: '0xBb30A5eEC397174d5DA58C4D180459DA51114988', mint: { amount: '1000000000000000000000', label: '1,000 TERC' } },
  },
  faucet: { url: 'https://ethereum.org/en/developers/docs/networks/#sepolia', label: 'Find a Sepolia ETH faucet', detail: 'For approvals, transfers and minting' },
  timing: {
    outbound: '1–2 min', incoming: '15–20 min + Claim',
    banner: 'Sepolia → gno takes about 15–20 minutes and needs a Claim transaction.',
    outboundNote: 'Delivery is followed by an acknowledgement back to gno in ~15 minutes. Wait ~20 minutes before returning TERC.',
    incomingNote: 'First approve the token, then sign the transfer. After Sepolia finalizes, claim on gno with Adena. Claim gas is paid in GNOT.',
    emptyClaims: 'After a Sepolia transfer, allow 15–20 minutes for its claim to appear.',
    pendingSend: 'Waiting for Sepolia delivery (~1–2 min) and the acknowledgement back to gno (~15 min).',
    delivered: 'Delivered on Sepolia. Waiting for the acknowledgement back to gno (~15 min).',
    pendingIncoming: 'Confirmed on Sepolia. Waiting for Ethereum finality and relay (~15–20 min), then a gno Claim transaction.',
    escrowError: 'The Ethereum escrow is still reserved for refunds. Wait about 20 minutes after the outbound transfer is acknowledged, then retry.',
  },
}

export const ARC_USDC: Address = '0x3600000000000000000000000000000000000000'
export function voucherDenom(clientId: string, address: string): string {
  return `ibc/${sha256(stringToHex(`transfer/${clientId}/${address.toLowerCase()}`)).slice(2).toUpperCase()}`
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`)
  return value as Record<string, unknown>
}
function address(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${label} must be a nonzero EVM address.`)
  return getAddress(value)
}

// Accept the deployment script's flat JSON shape, with an optional token list.
// No live addresses are assumed; selecting Arc without this file is an error.
export function arcRoute(input: unknown): BridgeRoute {
  const deployment = object(input, 'Arc deployment config')
  for (const [key, expected] of Object.entries({ chainId: '5042002', gnoChainId: 'test-arc-1', counterpartyClientId: 'arc-1', clientId: 'client-0' })) {
    if (String(deployment[key]) !== expected) throw new Error(`Arc ${key} must be ${expected}.`)
  }
  const contracts = {
    ics26Router: address(deployment.ics26Router, 'ics26Router'),
    ics20Transfer: address(deployment.ics20Transfer, 'ics20Transfer'),
    ugnotVoucher: address(deployment.ugnotVoucher, 'ugnotVoucher'),
    ...(deployment.gnoLightClient === undefined ? {} : { gnoLightClient: address(deployment.gnoLightClient, 'gnoLightClient') }),
    ...(deployment.ibcAdmin === undefined ? {} : { ibcAdmin: address(deployment.ibcAdmin, 'ibcAdmin') }),
  }
  const defaults: Record<string, BridgeToken> = {
    GNOT: { symbol: 'GNOT', decimals: 6, denom: 'ugnot', address: contracts.ugnotVoucher },
    USDC: { symbol: 'USDC', decimals: 6, denom: voucherDenom('arc-1', ARC_USDC), address: ARC_USDC },
  }
  const configured = deployment.tokens === undefined ? defaults : object(deployment.tokens, 'tokens')
  const tokens: Record<string, BridgeToken> = {}
  const addresses = new Set<string>()
  const denoms = new Set<string>()
  for (const [key, value] of Object.entries(configured)) {
    const token = object(value, `tokens.${key}`)
    if (!/^[A-Z][A-Z0-9]{0,15}$/.test(key) || token.symbol !== key) throw new Error(`Invalid token symbol: ${key}.`)
    if (typeof token.decimals !== 'number' || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) throw new Error(`Invalid decimals for ${key}.`)
    const tokenAddress = address(token.address, `tokens.${key}.address`)
    const denom = key === 'GNOT' ? 'ugnot' : voucherDenom('arc-1', tokenAddress)
    if (token.denom !== denom) throw new Error(`Invalid denom for ${key}; expected ${denom}.`)
    if (addresses.has(tokenAddress) || denoms.has(denom)) throw new Error(`Duplicate token address or denom: ${key}.`)
    addresses.add(tokenAddress); denoms.add(denom)
    let mint: BridgeToken['mint']
    if (token.mint !== undefined) {
      const data = object(token.mint, `tokens.${key}.mint`)
      if (typeof data.amount !== 'string' || !/^[1-9]\d*$/.test(data.amount) || BigInt(data.amount) >= (1n << 256n) || typeof data.label !== 'string' || !data.label) throw new Error(`Invalid mint configuration for ${key}.`)
      mint = { amount: data.amount, label: data.label }
    }
    tokens[key] = { symbol: key, decimals: token.decimals, denom, address: tokenAddress, ...(mint ? { mint } : {}) }
  }
  for (const [key, expected] of Object.entries(defaults)) {
    const actual = tokens[key]
    if (!actual || actual.address !== expected.address || actual.decimals !== expected.decimals || actual.mint) throw new Error(`Arc requires ${key} with its configured address and 6 decimals, without a mint button.`)
  }
  return {
    id: 'arc', origin: 'https://bridge-2.2-29-108-12.sslip.io',
    gno: { chainId: 'test-arc-1', rpc: 'https://rpc-2.2-29-108-12.sslip.io', web: 'https://gnoweb-2.2-29-108-12.sslip.io', clientId: 'arc-1', faucet: 'https://faucet-2.2-29-108-12.sslip.io' },
    evm: { chainId: 5042002, name: 'Arc Testnet', label: 'Arc Testnet', family: 'Arc', rpc: 'https://rpc.testnet.arc.io', walletRpc: 'https://rpc.testnet.arc.io', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, explorer: 'https://testnet.arcscan.app', clientId: 'client-0' },
    contracts, tokens,
    faucet: { url: 'https://faucet.circle.com', label: 'Get test USDC', detail: 'Circle faucet · Arc gas and transfers' },
    timing: {
      outbound: 'Seconds', incoming: 'Seconds + Claim',
      banner: 'Arc → gno takes seconds and needs a Claim transaction.',
      outboundNote: 'Delivery and the acknowledgement back to gno take seconds. Wait for the acknowledgement before returning vouchers.',
      incomingNote: 'First approve the token, then sign the transfer. Arc has instant finality; relay takes seconds. Claim on gno with Adena, paying gas in GNOT.',
      emptyClaims: 'After an Arc transfer, allow seconds for relay and the next status update for its claim to appear.',
      pendingSend: 'Waiting for Arc delivery and the acknowledgement back to gno (seconds).',
      delivered: 'Delivered on Arc. Waiting for the acknowledgement back to gno (seconds).',
      pendingIncoming: 'Confirmed on Arc. Waiting for relay (seconds), then a gno Claim transaction.',
      escrowError: 'The Arc escrow is still reserved for refunds. Wait for the outbound acknowledgement (normally seconds), then retry.',
    },
  }
}

export function selectRoute(name = 'sepolia', deployment?: unknown): BridgeRoute {
  if (name === 'sepolia') return SEPOLIA_ROUTE
  if (name === 'arc') {
    if (deployment === undefined) throw new Error('Arc requires VITE_BRIDGE_CONFIG pointing to a deployment config. Run npm run config:arc -- <5042002.json> <arc.local.json>.')
    return arcRoute(deployment)
  }
  throw new Error(`Unknown bridge route: ${name}. Use sepolia or arc.`)
}
