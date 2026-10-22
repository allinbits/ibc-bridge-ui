import { bech32 } from '@scure/base'
import { getAddress, isAddress } from 'viem'
import { ROUTER, TRANSFER, TOKENS } from './config'

export function validGnoAddress(value: string): boolean {
  if (!/^g1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(value)) return false
  try {
    const decoded = bech32.decode(value as `${string}1${string}`)
    return decoded.prefix === 'g' && bech32.fromWords(decoded.words).length === 20
  } catch { return false }
}

export function ethereumAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: true })) throw new Error('Enter a valid Ethereum address. Mixed-case addresses must have a valid checksum.')
  if (BigInt(value) <= 0xffffn) throw new Error('Zero and reserved Ethereum addresses cannot receive transfers.')
  if ([ROUTER, TRANSFER, TOKENS.GNOT.address, TOKENS.TERC.address, '0x3D8B06752b98A3D5ee5368870174B278Cc7a1442'].some(a => a.toLowerCase() === value.toLowerCase())) throw new Error('Use a wallet address, rather than a bridge or token contract.')
  return getAddress(value)
}

export const shorten = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`
