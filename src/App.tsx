import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { encodeFunctionData, type Address } from 'viem'
import { erc20Abi } from './lib/abi'
import { ethereumAddress, shorten, validGnoAddress } from './lib/address'
import { formatAmount, parseAmount, quoteTransfer } from './lib/amount'
import { ETH_CLIENT, GNO_CHAIN, GNO_CLIENT, GNOWEB, isGnoNative, ROUTE, TOKEN_IDS, TOKENS, TRANSFER, type Direction, type Token } from './lib/config'
import { approveIfNeeded, encodeTransfer, ethBalance, publicClient, reservedToken, simulateTransfer } from './lib/ethereum'
import { explainError } from './lib/errors'
import { adenaCall, connectAdena, connectEvm, discoverWallets, readAdenaAccount, sendEvm, type WalletOption } from './lib/wallets'
import { callMessage, gnoBalance, route, routeFee, transferMessage } from './lib/gno'
import type { TransferEntry } from './lib/history'
import { claimRemaining, openClaims } from './lib/status'
import { getGnoTx, recordUrl, transactionUrl } from './lib/tracking'
import { balanceKey, useBridge } from './useBridge'

const labels: Record<string, string> = { submitted: 'Submitted', approving: 'Approving token', 'approval-only': 'Approval only', relaying: 'Relaying', finalizing: 'Waiting for finality', claimable: 'Ready to claim', delivered: 'Delivered · awaiting ack', complete: 'Complete', failed: 'Failed', refunded: 'Refunded', 'refund-pending': 'Refund pending', attention: 'Needs attention' }
function External({ href, children, ...props }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}<span aria-hidden="true"> ↗</span></a>
}
function TokenIcon({ token }: { token: Token }) { return <span className={`token-icon ${token.toLowerCase()}`} aria-hidden="true">{isGnoNative(token) ? 'g' : token[0]}</span> }
function ChainIcon({ chain }: { chain: 'gno' | 'eth' }) { return <span className={`chain-icon ${chain}`} aria-hidden="true">{chain === 'gno' ? 'g' : '◇'}</span> }
function initialTheme() {
  try { const value = localStorage.getItem('bridge-theme'); if (value === 'dark' || value === 'light') return value } catch { /* Storage may be disabled. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [gnoAddress, setGnoAddress] = useState('')
  const [ethAddress, setEthAddress] = useState<Address | ''>('')
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [evmWallet, setEvmWallet] = useState<WalletOption>()
  const [direction, setDirection] = useState<Direction>('gno-eth')
  const [token, setToken] = useState<Token>('GNOT')
  const [amountText, setAmount] = useState('')
  const [customReceiver, setReceiver] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean; hash?: string; chain?: 'gno' | 'eth' }>()
  const [theme, setTheme] = useState(initialTheme)
  const bridge = useBridge(gnoAddress, ethAddress)
  const { putEntry } = bridge
  const fromGno = direction === 'gno-eth'
  const receiver = customReceiver ?? (fromGno ? ethAddress : gnoAddress)
  const sourceAddress = fromGno ? gnoAddress : ethAddress
  const sourceBalance = sourceAddress ? bridge.balances[balanceKey(fromGno ? 'gno' : 'eth', sourceAddress, token)] : undefined
  const ownClaims = gnoAddress ? openClaims(bridge.claims, gnoAddress) : []

  useEffect(() => discoverWallets(setWallets), [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('bridge-theme', theme) } catch { /* The selected theme still works in memory. */ }
  }, [theme])
  useEffect(() => {
    if (!evmWallet) return
    const changed = () => { setEthAddress(''); setEvmWallet(undefined); setNotice({ text: 'Ethereum account or network changed. Reconnect to review balances and continue.' }) }
    evmWallet.provider.on?.('accountsChanged', changed)
    evmWallet.provider.on?.('chainChanged', changed)
    evmWallet.provider.on?.('disconnect', changed)
    return () => { for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) evmWallet.provider.removeListener?.(event, changed) }
  }, [evmWallet])
  useEffect(() => {
    if (!gnoAddress) return
    const check = async () => {
      try {
        const account = await readAdenaAccount()
        if (account.address === gnoAddress) return
      } catch { /* Network changes and revoked connections invalidate the session. */ }
      setGnoAddress('')
      setNotice({ text: 'Adena account or network changed. Reconnect to continue.' })
    }
    const timer = window.setInterval(() => void check(), 15_000)
    window.addEventListener('focus', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [gnoAddress])

  let validation = ''
  let quote: ReturnType<typeof quoteTransfer> | undefined
  let configuredFee: bigint | undefined
  let amount = 0n
  try {
    if (bridge.routeData) configuredFee = routeFee(bridge.routeData, token)
    if (amountText) {
      amount = parseAmount(amountText, TOKENS[token].decimals)
      if (!bridge.routeData || configuredFee === undefined) throw new Error('Waiting for live route fees.')
      quote = quoteTransfer(direction, token, amount, configuredFee)
      if (fromGno && isGnoNative(token)) {
        if (bridge.routeData.closed || bridge.routeData.loss_closed) throw new Error('This route is closed for native sends. Contact the operators.')
        const denom = bridge.routeData.denoms.find(d => d.denom === 'ugnot')!
        if (BigInt(denom.send_min) > amount) throw new Error(`Minimum: ${formatAmount(BigInt(denom.send_min), 6)} GNOT.`)
        if (BigInt(denom.send_max) > 0n && amount > BigInt(denom.send_max)) throw new Error(`Maximum: ${formatAmount(BigInt(denom.send_max), 6)} GNOT.`)
      }
      if (sourceBalance !== undefined && quote.total > sourceBalance) throw new Error('Your balance is too low for the amount and route fee.')
    }
    if (receiver) {
      if (fromGno) ethereumAddress(receiver)
      else if (!validGnoAddress(receiver)) throw new Error('Enter a valid lowercase g1 address with a valid bech32 checksum.')
    }
  } catch (error) { validation = explainError(error) }
  const canSend = !!(sourceAddress && amountText && receiver && quote && !validation && !busy && (fromGno || evmWallet))

  async function run(label: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(label)
    setNotice(undefined)
    try { await action() }
    catch (error) { setNotice({ text: explainError(error), error: true }) }
    finally { setBusy(''); void bridge.refresh() }
  }
  const connectGno = () => run('Connecting Adena…', async () => { const account = await connectAdena(); setGnoAddress(account.address) })
  const connectEth = (wallet: WalletOption) => run(`Connecting ${wallet.name}…`, async () => { const address = await connectEvm(wallet); setEvmWallet(wallet); setEthAddress(address) })

  async function transfer(event: FormEvent) {
    event.preventDefault()
    if (!canSend || !quote) return
    const reviewedFee = quote.fee
    await run('Preparing transfer…', async () => {
      const data = await route()
      const freshQuote = quoteTransfer(direction, token, amount, routeFee(data, token))
      if (freshQuote.fee !== reviewedFee) throw new Error('The route fee changed. Refresh and review the new fee before signing.')
      const recipient = fromGno ? ethereumAddress(receiver) : receiver
      if (!fromGno && !validGnoAddress(recipient)) throw new Error('Invalid gno receiver.')
      const balance = fromGno ? await gnoBalance(token, gnoAddress) : await ethBalance(token, ethAddress as Address)
      if (balance < freshQuote.total) throw new Error('Insufficient token balance for this transfer.')
      if (fromGno && !isGnoNative(token) && await reservedToken(token) > 0n) throw new Error(ROUTE.id === 'sepolia' ? 'TERC escrow is still reserved on Sepolia. Wait about 20 minutes after the outbound send is acknowledged, then retry.' : ROUTE.timing.escrowError)
      let entry: TransferEntry = { id: crypto.randomUUID(), direction, token, amount: amount.toString(), sender: sourceAddress, receiver: recipient, created: Date.now(), timeout: (BigInt(Math.floor(Date.now() / 1000)) + 7200n).toString(), status: 'submitted', detail: 'Waiting for source transaction confirmation.' }
      if (fromGno) {
        const [block, destination] = await Promise.all([publicClient.getBlockNumber(), ethBalance(token, recipient as Address)])
        entry.ethStartBlock = block.toString()
        entry.destinationBaseline = destination.toString()
        setBusy('Confirm in Adena…')
        const result = await adenaCall(gnoAddress, transferMessage(gnoAddress, recipient, token, amount, reviewedFee, BigInt(entry.timeout)))
        entry.hash = result.hash
        entry.sourceHeight = result.height
        putEntry(entry)
      } else {
        if (!evmWallet || !ethAddress) throw new Error('Connect an Ethereum wallet first.')
        setBusy('Checking token allowance…')
        try {
          await approveIfNeeded(evmWallet, ethAddress, token, amount, hash => {
            entry = { ...entry, approvalHash: hash, status: 'approving', detail: 'Token approval submitted. The bridge transfer needs a separate signature.' }
            putEntry(entry)
            setBusy('Waiting for approval, then transfer…')
          })
          // Approval may take minutes. Start a fresh two-hour packet window.
          entry.timeout = (BigInt(Math.floor(Date.now() / 1000)) + 7200n).toString()
          await simulateTransfer(ethAddress, token, amount, recipient, BigInt(entry.timeout))
          setBusy(`Confirm transfer in ${evmWallet.name}…`)
          const hash = await sendEvm(evmWallet, ethAddress, TRANSFER, encodeTransfer(token, amount, recipient, BigInt(entry.timeout)))
          entry = { ...entry, hash, status: 'submitted', detail: `Transfer submitted on ${ROUTE.evm.name}. Waiting for its receipt.` }
          putEntry(entry)
        } catch (error) {
          if (entry.approvalHash && !entry.hash) putEntry({ ...entry, status: 'approval-only', detail: 'Only the approval was submitted. Check its receipt, then submit the transfer form again; an existing allowance is reused.' })
          throw error
        }
      }
      setNotice({ text: 'Transfer submitted. Follow its progress in Activity below.', hash: entry.hash, chain: fromGno ? 'gno' : 'eth' })
      setAmount('')
    })
  }
  function claim(denom: string, refund = false) {
    return run(refund ? 'Claiming refunds…' : 'Claiming on gno…', async () => {
      if (!gnoAddress) throw new Error(`Connect Adena on ${GNO_CHAIN} to claim.`)
      const result = await adenaCall(gnoAddress, callMessage(gnoAddress, refund ? 'ClaimRefunds' : 'Claim', [GNO_CLIENT, denom, '20']))
      for (const entry of bridge.history.filter(e => (refund ? e.sender : e.receiver) === gnoAddress && TOKENS[e.token].denom === denom)) putEntry({ ...entry, claimHash: result.hash })
      setNotice({ text: 'Claim submitted. Claims are processed in route queue order, up to 20 per call. If your claim remains open, wait for payout capacity and try again.', hash: result.hash, chain: 'gno' })
      // A wallet may return as soon as a transaction enters the mempool.
      try { const tx = await getGnoTx(result.hash); if (tx.error) throw new Error(`gno VM: ${tx.error}`) }
      catch (error) { setNotice({ text: `Claim broadcast; verify its transaction result: ${explainError(error)}`, hash: result.hash, chain: 'gno', error: true }) }
    })
  }
  const mint = (mintToken: Token) => run('Confirm mint in your wallet…', async () => {
    if (!evmWallet || !ethAddress) throw new Error(`Connect MetaMask or Keplr on ${ROUTE.evm.name} first.`)
    const config = TOKENS[mintToken].mint
    if (!config) throw new Error('This token has no public test mint.')
    const hash = await sendEvm(evmWallet, ethAddress, TOKENS[mintToken].address, encodeFunctionData({ abi: erc20Abi, functionName: 'mint', args: [ethAddress, BigInt(config.amount)] }))
    setNotice({ text: `Mint of ${config.label.replace(mintToken, `test ${mintToken}`)} submitted. Refresh balances after confirmation.`, hash, chain: 'eth' })
    // Return control immediately after broadcast; the hash remains visible.
  })

  return <>
    <a className="skip-link" href="#transfer">Skip to transfer</a>
    <header className="site-header wrap">
      <a className="brand" href="/" aria-label="gno.land Bridge home"><img src="/bridge.svg" width="38" height="38" alt="" /><span>gno.land <span className="brand-light">/ bridge</span></span></a>
      <div className="header-actions"><span className="testnet-tag">TESTNET</span><button className="icon-button" aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '◐' : '◑'}</button></div>
    </header>
    <main className="wrap">
      <section className="intro">
        <div><p className="eyebrow">GNO.LAND ↔ {ROUTE.evm.family.toUpperCase()}</p><h1>Two chains.<br /><span>One open connection.</span></h1><p className="intro-copy">Move {TOKEN_IDS.join(' and ')} between {GNO_CHAIN} and {ROUTE.evm.name}.<br className="desktop-break" /> Powered by IBC. Signed by your wallet.</p></div>
        <div className="route-stamp"><span className={`status-dot ${bridge.routeData && !bridge.errors.some(e => e.startsWith('Route:')) ? 'online' : ''}`} /><span>{bridge.routeData ? bridge.errors.some(e => e.startsWith('Route:')) ? 'Route query unavailable' : bridge.routeData.closed ? 'Route restricted' : 'Route connected' : 'Checking route…'}<small>{GNO_CLIENT} <span aria-hidden="true">↔</span> {ETH_CLIENT}</small></span></div>
      </section>

      <div className="testnet-banner"><span aria-hidden="true">ⓘ</span><p>A place to test. <strong>Use test tokens only.</strong> {ROUTE.timing.banner}</p></div>
      {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><div>{notice.text}{notice.hash && <div><External href={transactionUrl(notice.hash, notice.chain!)}>{shorten(notice.hash)}</External></div>}</div><button className="dismiss" aria-label="Dismiss notification" onClick={() => setNotice(undefined)}>×</button></div>}
      {bridge.errors.length > 0 && <details className="network-errors"><summary>Some live data is unavailable · showing last successful values</summary><ul>{bridge.errors.map(error => <li key={error}>{error}</li>)}</ul><button className="text-button" onClick={() => void bridge.refresh()} disabled={bridge.refreshing}>Retry queries</button></details>}
      {bridge.storageError && <p className="notice error" role="alert">Browser storage is unavailable. Keep this page open and save your transaction hashes; activity cannot survive a reload.</p>}

      <div className="workspace">
        <section className="panel transfer-panel" id="transfer" aria-labelledby="transfer-title">
          <div className="panel-heading"><h2 id="transfer-title">Bridge tokens</h2><span className="step-label">01 / TRANSFER</span></div>
          <form onSubmit={transfer}>
            <div className="direction-toggle" role="group" aria-label="Transfer direction"><button type="button" aria-pressed={fromGno} onClick={() => { setDirection('gno-eth'); setReceiver(null) }} disabled={!!busy}>gno → {ROUTE.evm.name}</button><button type="button" aria-pressed={!fromGno} onClick={() => { setDirection('eth-gno'); setReceiver(null) }} disabled={!!busy}>{ROUTE.evm.name} → gno</button></div>
            <div className="chain-route"><div><ChainIcon chain={fromGno ? 'gno' : 'eth'} /><span><small>From</small><strong>{fromGno ? 'gno.land' : ROUTE.evm.family}</strong><small>{fromGno ? GNO_CHAIN : ROUTE.evm.name}</small></span></div><span className="route-arrow" aria-hidden="true">⟶</span><div><ChainIcon chain={fromGno ? 'eth' : 'gno'} /><span><small>To</small><strong>{fromGno ? ROUTE.evm.family : 'gno.land'}</strong><small>{fromGno ? ROUTE.evm.name : GNO_CHAIN}</small></span></div></div>
            <div className="amount-box"><div className="field-top"><label htmlFor="amount">You send</label><span title={sourceBalance === undefined ? undefined : formatAmount(sourceBalance, TOKENS[token].decimals)}>Balance: {sourceBalance === undefined ? '—' : formatAmount(sourceBalance, TOKENS[token].decimals)}</span></div><div className="amount-row"><input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amountText} onChange={e => setAmount(e.target.value)} aria-describedby="form-error" disabled={!!busy} required /><div className="token-picker"><TokenIcon token={token} /><label className="sr-only" htmlFor="token">Token</label><select id="token" value={token} onChange={e => setToken(e.target.value as Token)} disabled={!!busy}>{TOKEN_IDS.map(id => <option key={id}>{id}</option>)}</select></div></div><p>{isGnoNative(token) ? (fromGno ? 'Native GNOT → GNOT voucher' : 'GNOT voucher → native GNOT') : (fromGno ? `${token} voucher → original ${token}` : `Original ${token} → ${token} voucher`)}</p></div>
            <div className="receiver-field"><div className="field-top"><label htmlFor="receiver">Recipient address</label>{customReceiver !== null && <button type="button" className="text-button" onClick={() => setReceiver(null)}>Use connected wallet</button>}</div><input id="receiver" value={receiver} onChange={e => setReceiver(e.target.value)} placeholder={fromGno ? '0x… Ethereum address' : 'g1… gno.land address'} autoComplete="off" spellCheck={false} disabled={!!busy} required /><p>{fromGno ? `Receive tokens in an ${ROUTE.evm.family === 'Ethereum' ? 'Ethereum' : 'EVM'} wallet on ${ROUTE.evm.name}.` : 'Receive in a gno wallet, then use Adena to claim.'}</p></div>
            <dl className="quote"><div><dt>Route fee {fromGno ? '' : '(deducted at claim)'}</dt><dd>{quote ? `${formatAmount(quote.fee, TOKENS[token].decimals)} ${token}` : configuredFee !== undefined ? `${formatAmount(fromGno && !isGnoNative(token) ? 0n : configuredFee, TOKENS[token].decimals)} ${token}` : bridge.routeData ? 'Fee unavailable' : 'Loading live fee…'}</dd></div><div><dt>{fromGno ? 'Total token debit' : 'Estimated received'}</dt><dd>{quote ? `${formatAmount(fromGno ? quote.total : quote.receive, TOKENS[token].decimals)} ${token}` : '—'}</dd></div><div><dt>Network gas</dt><dd>{fromGno ? 'GNOT · shown in Adena' : `${ROUTE.evm.name} ${ROUTE.evm.nativeCurrency.symbol} · shown in wallet`}</dd></div><div><dt>Estimated delivery</dt><dd>{fromGno ? ROUTE.timing.outbound : ROUTE.timing.incoming}</dd></div></dl>
            <div className="timing-note"><span aria-hidden="true">◷</span><p>{fromGno ? ROUTE.timing.outboundNote : ROUTE.timing.incomingNote} <span>Packet timeout: 2 hours.</span></p></div>
            <p id="form-error" className="form-error" role="status">{validation}</p>
            <button className="primary-button" type="submit" disabled={!canSend}>{busy || (!sourceAddress ? `Connect ${fromGno ? 'Adena' : 'an Ethereum wallet'} to continue` : 'Transfer with ' + (fromGno ? 'Adena' : evmWallet?.name ?? 'wallet'))}<span aria-hidden="true">↗</span></button>
            <p className="form-footer">Review the receiver and amounts in your wallet before signing.</p>
          </form>
        </section>

        <aside className="sidebar" aria-label="Wallets and test funds">
          <section className="panel wallets-panel"><div className="panel-heading"><h2>Your wallets</h2><button className="icon-button refresh-button" aria-label="Refresh balances and transfers" onClick={() => void bridge.refresh()} disabled={bridge.refreshing}>{bridge.refreshing ? '⋯' : '↻'}</button></div><p className="panel-subtitle">Connect both sides for the full picture.</p>
            <WalletCard chain="gno" address={gnoAddress} name="Adena" balances={bridge.balances} action={<button className="connect-button" onClick={() => void connectGno()} disabled={!!busy}>{gnoAddress ? 'Reconnect Adena' : 'Connect Adena'}</button>} />
            <WalletCard chain="eth" address={ethAddress} name={evmWallet?.name ?? 'MetaMask / Keplr'} balances={bridge.balances} action={<div className="wallet-options">{wallets.length ? wallets.map(wallet => <button className="connect-button" key={wallet.id} onClick={() => void connectEth(wallet)} disabled={!!busy}>{ethAddress && evmWallet?.id === wallet.id ? 'Reconnect' : 'Connect'} {wallet.name}</button>) : <p className="install-hint">Install <External href="https://metamask.io/download/">MetaMask</External> or <External href="https://www.keplr.app/download">Keplr</External> with EVM support, then reload.</p>}</div>} />
            {!window.adena && <p className="install-hint">Need a gno wallet? <External href="https://www.adena.app/">Get Adena</External></p>}
          </section>
          <section className="funds-card"><p className="eyebrow">START EXPLORING</p><h2>A little test fuel.</h2><p>Top up your wallets before crossing.</p><div className="funds-links"><External href={ROUTE.gno.faucet}>Get test GNOT <small>gno.land faucet</small></External>{TOKEN_IDS.filter(id => TOKENS[id].mint).map(id => <button key={id} onClick={() => void mint(id)} disabled={!!busy || !ethAddress}>Mint test {id} <small>{TOKENS[id].mint!.label} · {ROUTE.evm.name} gas required</small><span aria-hidden="true">↗</span></button>)}<External href={ROUTE.faucet.url}>{ROUTE.faucet.label} <small>{ROUTE.faucet.detail}</small></External></div></section>
          {TOKEN_IDS.filter(id => (bridge.reservations[id] ?? 0n) > 0n).map(id => <div className="escrow-note" key={id}><strong>{id} returns need a little time.</strong><p>{formatAmount(bridge.reservations[id], TOKENS[id].decimals)} {id} is reserved on {ROUTE.evm.name}. Wait until the outbound acknowledgement releases it before sending vouchers back.</p></div>)}
        </aside>
      </div>

      <section className="panel claims-panel" aria-labelledby="claims-title"><div className="panel-heading"><h2 id="claims-title">Ready on gno <span className="count">{ownClaims.length}</span></h2><span className="step-label">02 / CLAIM</span></div><p className="panel-subtitle">Incoming transfers land as claims. Anyone can pay the queue; tokens always go to the recorded recipient.</p>{ownClaims.length ? <div className="claims-list">{ownClaims.map(c => { const symbol = TOKEN_IDS.find(id => TOKENS[id].denom === c.denom); return <div className="claim-row" key={c.key}><div><strong>{symbol ? `${formatAmount(claimRemaining(c), TOKENS[symbol].decimals)} ${symbol}` : `${claimRemaining(c)} base units`}</strong><small>{c.key} · remainder includes unpaid fee</small></div><button className="connect-button" onClick={() => void claim(c.denom)} disabled={!!busy || !gnoAddress}>Claim with Adena</button></div> })}</div> : <div className="empty-claims"><span aria-hidden="true">✓</span><p>{gnoAddress ? 'No open claims for this address.' : 'Connect Adena to see your open claims.'}<small>{ROUTE.timing.emptyClaims}</small></p></div>}<p className="claim-footnote">Claims run in queue order, up to 20 per call. Route payout limits or pauses may delay payment.</p></section>

      <section className="activity" aria-labelledby="activity-title"><div className="activity-heading"><div><p className="eyebrow">YOUR CROSSINGS</p><h2 id="activity-title">Activity</h2></div><span className="muted">Saved in this browser · updates every 15s</span></div>{bridge.history.length ? <div className="history-list">{bridge.history.map(entry => <article className="panel history-card" key={entry.id}><div className="history-top"><div className="history-token"><TokenIcon token={entry.token} /><div><strong>{formatAmount(BigInt(entry.amount), TOKENS[entry.token].decimals)} {entry.token}</strong><small>{entry.direction === 'gno-eth' ? `gno.land → ${ROUTE.evm.name}` : `${ROUTE.evm.name} → gno.land`} · {new Date(entry.created).toLocaleString()}</small></div></div><span className={`state-tag state-${entry.status}`}>{labels[entry.status] ?? entry.status}</span></div><p>{entry.detail}</p><div className="transfer-progress" aria-label={`Transfer status: ${labels[entry.status] ?? entry.status}`}><span className={entry.hash ? 'done' : ''}>Signed</span><span className={['claimable', 'delivered', 'complete'].includes(entry.status) ? 'done' : ''}>{entry.direction === 'gno-eth' ? 'Delivered' : 'Finalized & relayed'}</span><span className={entry.status === 'complete' ? 'done' : ''}>{entry.direction === 'gno-eth' ? 'Acknowledged' : 'Claimed'}</span></div><div className="history-addresses"><span title={entry.sender}>From {shorten(entry.sender)}</span><span title={entry.receiver}>To {shorten(entry.receiver)}</span>{entry.sequence && <span>Packet #{entry.sequence}</span>}</div><div className="history-links">{entry.hash && <External href={transactionUrl(entry.hash, entry.direction === 'gno-eth' ? 'gno' : 'eth')} title={entry.hash}>Tx {shorten(entry.hash)}</External>}{entry.approvalHash && <External href={transactionUrl(entry.approvalHash, 'eth')}>Approval</External>}{entry.relayHash && <External href={transactionUrl(entry.relayHash, 'eth')}>{ROUTE.evm.name} delivery</External>}{entry.claimHash && <External href={transactionUrl(entry.claimHash, 'gno')}>Claim transaction</External>}<External href={recordUrl(entry)}>gnoweb record</External></div>{entry.destinationBalance !== undefined && <small className="destination-balance">Latest recipient balance: {formatAmount(BigInt(entry.destinationBalance), TOKENS[entry.token].decimals)} {entry.token}. Balance changes alone do not confirm a transfer.</small>}{entry.pollError && <p className="tracking-error">Status query will retry: {entry.pollError}</p>}{entry.status === 'claimable' && gnoAddress && <button className="connect-button" disabled={!!busy} onClick={() => void claim(TOKENS[entry.token].denom)}>Claim on gno</button>}{entry.status === 'refund-pending' && entry.direction === 'gno-eth' && gnoAddress && <button className="connect-button" disabled={!!busy} onClick={() => void claim(TOKENS[entry.token].denom, true)}>Claim queued refunds</button>}</article>)}</div> : <div className="panel empty-history"><span className="empty-bridge" aria-hidden="true">⟷</span><h3>Your next crossing starts here.</h3><p>Connect a wallet and make a transfer.<br />Its progress and transaction links will appear here.</p></div>}</section>
    </main>
    <footer className="wrap site-footer"><span>gno.land <span className="muted">/ IBC testnet bridge</span></span><div><External href={`${GNOWEB}/r/aib/ibc/apps/transfer:routes/${GNO_CLIENT}`}>Route on gnoweb</External><External href={`${ROUTE.evm.explorer}/address/${TRANSFER}`}>{ROUTE.evm.name} contract</External></div></footer>
    {busy && <div className="busy-bar" role="status"><span className="spinner" />{busy}</div>}
  </>
}

function WalletCard({ chain, address, name, balances, action }: { chain: 'gno' | 'eth'; address: string; name: string; balances: Record<string, bigint>; action: ReactNode }) {
  return <div className="wallet-card"><div className="wallet-card-heading"><ChainIcon chain={chain} /><div><strong>{chain === 'gno' ? 'gno.land' : ROUTE.evm.label}</strong><small>{name}</small></div>{address && <span className="connected-dot" aria-label="Connected" />}</div>{address && <p className="wallet-address" title={address}>{shorten(address)} <button className="text-button" aria-label={`Copy ${chain} address`} onClick={() => { void navigator.clipboard?.writeText(address) }}>Copy</button></p>}<dl className="wallet-balances">{TOKEN_IDS.map(token => { const balance = address ? balances[balanceKey(chain, address, token)] : undefined; return <div key={token}><dt><TokenIcon token={token} />{token}<small>{chain === 'gno' ? isGnoNative(token) ? 'native' : 'voucher' : isGnoNative(token) ? 'voucher' : 'ERC20'}</small></dt><dd title={balance === undefined ? undefined : formatAmount(balance, TOKENS[token].decimals)}>{balance === undefined ? '—' : formatAmount(balance, TOKENS[token].decimals)}</dd></div> })}</dl>{action}</div>
}
