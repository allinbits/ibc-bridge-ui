import { isGnoNative, MAX_COIN, MAX_ROUTE_AMOUNT, MAX_UINT256, type Direction, type Token } from './config'

export function parseAmount(text: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Invalid token decimals.')
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw new Error('Enter a positive decimal amount, without spaces or exponents.')
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`)
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (amount <= 0n) throw new Error('The amount must be greater than zero.')
  if (amount > MAX_UINT256) throw new Error('The amount exceeds uint256.')
  return amount
}

export function formatAmount(amount: bigint, decimals: number): string {
  const sign = amount < 0n ? '-' : ''
  const absolute = amount < 0n ? -amount : amount
  const scale = 10n ** BigInt(decimals)
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${sign}${absolute / scale}${fraction ? `.${fraction}` : ''}`
}

export function quoteTransfer(direction: Direction, token: Token, amount: bigint, configuredFee: bigint) {
  if (amount <= 0n || amount > MAX_ROUTE_AMOUNT) throw new Error('This route accepts amounts up to 2^96 − 1 base units.')
  if (configuredFee < 0n) throw new Error('Invalid route fee.')
  // Voucher exits on gno are burned in full, with no fee (impl/v1/send.gno).
  const fee = direction === 'gno-eth' && !isGnoNative(token) ? 0n : configuredFee
  const total = direction === 'gno-eth' && isGnoNative(token) ? amount + fee : amount
  if (direction === 'gno-eth' && isGnoNative(token) && total > MAX_COIN) throw new Error('Amount plus fee exceeds the native coin limit (2^63 − 1).')
  if (direction === 'eth-gno' && amount <= fee) throw new Error('The amount must exceed the gno claim fee.')
  return { fee, total, receive: direction === 'eth-gno' ? amount - fee : amount, send: direction === 'gno-eth' && isGnoNative(token) ? `${total}ugnot` : '' }
}
