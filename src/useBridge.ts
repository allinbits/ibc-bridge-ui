import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { POLL_MS } from './lib/config'
import { ethBalance, reservedTerc } from './lib/ethereum'
import { explainError } from './lib/errors'
import { getClaims, gnoBalance, route } from './lib/gno'
import { isTerminal, loadHistory, saveEntry, type TransferEntry } from './lib/history'
import type { Claim, Route } from './lib/status'
import { trackEntry } from './lib/tracking'

export const balanceKey = (chain: 'gno' | 'eth', address: string, token: string) => `${chain}:${address.toLowerCase()}:${token}`
export function useBridge(gnoAddress: string, ethAddress: Address | '') {
  const [routeData, setRoute] = useState<Route>()
  const [claims, setClaims] = useState<Claim[]>([])
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [reservation, setReservation] = useState<bigint>()
  const [errors, setErrors] = useState<string[]>([])
  const [history, setHistory] = useState<TransferEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const historyRef = useRef(history)
  const refreshingRef = useRef(false)
  const generation = useRef(0)
  const putEntry = useCallback((entry: TransferEntry) => {
    const updated = { ...entry, updated: Date.now() }
    const items = historyRef.current.filter(e => e.id !== entry.id)
    historyRef.current = [updated, ...items].sort((a, b) => b.created - a.created)
    setHistory(historyRef.current)
    if (!saveEntry(updated)) setStorageError(true)
  }, [])
  useEffect(() => {
    generation.current++
    const stored = loadHistory([gnoAddress, ethAddress])
    historyRef.current = stored
    setHistory(stored)
  }, [gnoAddress, ethAddress])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    const currentGeneration = generation.current
    setRefreshing(true)
    const problems: string[] = []
    const run = async (label: string, job: () => Promise<void>) => {
      try { await job() } catch (error) { problems.push(`${label}: ${explainError(error)}`) }
    }
    const updateBalance = async (chain: 'gno' | 'eth', address: string, token: 'GNOT' | 'TERC') => {
      const value = chain === 'gno' ? await gnoBalance(token, address) : await ethBalance(token, address as Address)
      if (generation.current === currentGeneration) setBalances(previous => ({ ...previous, [balanceKey(chain, address, token)]: value }))
    }
    await Promise.allSettled([
      run('Route', async () => { const data = await route(); setRoute(data) }),
      run('Claims', async () => { const data = await getClaims(); setClaims(data) }),
      run('Sepolia escrow', async () => { const amount = await reservedTerc(); setReservation(amount) }),
      ...(['GNOT', 'TERC'] as const).flatMap(token => [
        ...(gnoAddress ? [run(`gno ${token} balance`, () => updateBalance('gno', gnoAddress, token))] : []),
        ...(ethAddress ? [run(`Sepolia ${token} balance`, () => updateBalance('eth', ethAddress, token))] : []),
      ]),
      ...historyRef.current.filter(e => e.hash && !isTerminal(e.status)).map(entry => run('Tracking', async () => {
        let updated: TransferEntry
        try { updated = await trackEntry(entry) }
        catch (error) { updated = { ...entry, pollError: explainError(error) } }
        // Wallet changes and new submissions must not be overwritten by an older poll.
        const latest = historyRef.current.find(e => e.id === entry.id)
        if (generation.current === currentGeneration && latest && latest.updated === entry.updated) putEntry(updated)
      })),
    ])
    setErrors(problems)
    setRefreshing(false)
    refreshingRef.current = false
  }, [ethAddress, gnoAddress, putEntry])

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      await refresh()
      if (!disposed) timer = setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('focus', focus) }
  }, [refresh])

  return { routeData, claims, balances, reservation, errors, history, refreshing, refresh, putEntry, storageError }
}
