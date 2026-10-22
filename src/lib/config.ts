import type { Address } from 'viem'

export const ORIGIN = 'https://bridge.2-29-108-12.sslip.io'
export const GNO_RPC = 'https://rpc.2-29-108-12.sslip.io'
export const ETH_RPC = 'https://rpc.sepolia.ethpandaops.io'
export const GNOWEB = 'https://gnoweb.2-29-108-12.sslip.io'
export const REALM = 'gno.land/r/aib/ibc/apps/transfer'
export const GNO_CHAIN = 'test-ibc-1'
export const GNO_CLIENT = 'ethereum-1'
export const ETH_CLIENT = 'client-0'
export const ROUTER: Address = '0x6a1E8C6F167006dE6d95fE05e930765d0EA9f49d'
export const TRANSFER: Address = '0xe44499e840797B6b452f074100BC66030dBf69F5'
export const TERC_DENOM = 'ibc/F7F044B527F1D7A9301210CB2F71A567B4FEA33C96B2CA56CB7D443AA3984D0C'
export const TOKENS = {
  GNOT: { symbol: 'GNOT', decimals: 6, denom: 'ugnot', address: '0x3c15f5CA79D6051FC582D8e7eFB0b39da3cb3212' as Address },
  TERC: { symbol: 'TERC', decimals: 18, denom: TERC_DENOM, address: '0xBb30A5eEC397174d5DA58C4D180459DA51114988' as Address },
} as const
export type Token = keyof typeof TOKENS
export type Direction = 'gno-eth' | 'eth-gno'
export const POLL_MS = 15_000
export const MAX_ROUTE_AMOUNT = (1n << 96n) - 1n
export const MAX_COIN = (1n << 63n) - 1n
export const MAX_UINT256 = (1n << 256n) - 1n
