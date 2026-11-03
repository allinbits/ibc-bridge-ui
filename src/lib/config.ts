import { defineChain } from 'viem'
import { sepolia } from 'viem/chains'
import selectedRoute from 'virtual:bridge-route'

export const ROUTE = selectedRoute
export const ORIGIN = ROUTE.origin
export const GNO_RPC = ROUTE.gno.rpc
export const ETH_RPC = ROUTE.evm.rpc
export const GNOWEB = ROUTE.gno.web
export const REALM = 'gno.land/r/aib/ibc/apps/transfer'
export const GNO_CHAIN = ROUTE.gno.chainId
export const GNO_CLIENT = ROUTE.gno.clientId
export const ETH_CLIENT = ROUTE.evm.clientId
export const ROUTER = ROUTE.contracts.ics26Router
export const TRANSFER = ROUTE.contracts.ics20Transfer
export const TOKENS = ROUTE.tokens
export const TOKEN_IDS = Object.keys(TOKENS)
export type Token = string
export const isGnoNative = (token: Token) => TOKENS[token].denom === 'ugnot'
export const EVM_CHAIN = ROUTE.id === 'sepolia' ? sepolia : defineChain({
  id: ROUTE.evm.chainId, name: ROUTE.evm.name, nativeCurrency: ROUTE.evm.nativeCurrency,
  rpcUrls: { default: { http: [ETH_RPC] } }, blockExplorers: { default: { name: 'Arcscan', url: ROUTE.evm.explorer } },
})
export type Direction = 'gno-eth' | 'eth-gno'
export const POLL_MS = 15_000
export const MAX_ROUTE_AMOUNT = (1n << 96n) - 1n
export const MAX_COIN = (1n << 63n) - 1n
export const MAX_UINT256 = (1n << 256n) - 1n
