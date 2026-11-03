# gno.land testnet bridge

A static bridge. The default build supports GNOT (6 decimals) and TERC (18 decimals) over the live
`test-ibc-1` ↔ Ethereum Sepolia IBC route. Intended origin:
https://bridge.2-29-108-12.sslip.io.

An opt-in Arc build supports `test-arc-1` ↔ Arc Testnet at
https://bridge-2.2-29-108-12.sslip.io, with GNOT and USDC (both 6 decimals).
See [Arc build and deployment](deploy/ARC.md). Plain `npm run build` keeps
the existing Sepolia route, wallets, tokens, addresses, fees, and timing.

```sh
npm ci
npm run dev
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run preview
```

Node >=22.12. Runtime and development dependencies have exact versions and a
committed lockfile. The build is in `dist/`; no backend or runtime secrets.

Connect Adena for gno and MetaMask or Keplr for Ethereum. Adena prompts to add
or switch the custom network; Ethereum wallets switch to Sepolia. Keplr is
offered only when its EIP-1193 EVM provider is injected (`keplr.ethereum` or
EIP-6963); Cosmos-only Keplr installations cannot sign these transactions.
The app uses the documented [Adena API](https://docs.adena.app/integrations)
and Keplr's `@keplr-wallet/types` Ethereum provider contract.

For gno → Sepolia, Adena signs one `/vm.m_call` to Transfer. Native GNOT sends
the amount **plus the live ugnot route fee**. A returning TERC voucher burns
the full amount, sends no coins, and pays no route fee. Delivery is normally
1–2 minutes; acknowledgement back to gno takes about 15 minutes. Wait about
20 minutes before returning TERC. The app checks Sepolia's reserved escrow.

For Sepolia → gno, approve the token for the exact amount (both TERC and GNOT
vouchers), then sign sendTransfer. Delivery waits ~15–20 minutes for Sepolia
finality. The receiver then uses Claim with Adena, paying gas in GNOT. Claim
processes the denom queue, up to 20 entries, and deducts its route fee.
Metered payouts can be partial and need further calls. Fees shown before
signing are live estimates; governance can change incoming claim fees
before payout. Use the gno faucet, public TERC mint button, and linked
Sepolia ETH faucet directory for test funds.

Activity persists in localStorage per participating address. Reconnect
after reload to resume polling. Packet IDs come from source transaction
events; destination balances are supplementary, never delivery proof. gno
records distinguish success, error, timeout, paid refunds, and queued
refunds. Claims distinguish open/partial, paid, and operator attention.
Polling follows all render pages and retries RPC failures every 15 seconds
after the previous poll finishes. Clearing browser data removes activity,
but open claims can still be discovered on chain. Wallet secrets are never
requested or stored.

`src/lib/` holds protocol, wallet, bigint, query, status, and persistence
code; `src/App.tsx` and `src/styles.css` hold the responsive light/dark UI.
`src/lib/config.ts` exposes the selected build-time route. Defaults and
validation live in `src/lib/routes.ts`; Arc contract addresses and tokens
come from the deployment JSON or a generated local config file. Set
`VITE_BRIDGE_ROUTE=arc` and `VITE_BRIDGE_CONFIG=./arc.local.json` to select it.
Missing or invalid Arc configuration fails the build. Keep Caddy's CSP in
sync with the selected route's endpoints. All build configuration is public.

`npm test` checks amounts, checksums, fees, MsgCall structure, errors,
pagination, captured live tm2 statuses, route selection, Arc configuration,
wallet network parameters, and Arc transfers/tracking with wallet/RPC stubs.
The Arc deployment fixture uses synthetic addresses, never live contracts.
ABI vectors are independently
produced with go-ethereum `abi.Pack` and the exact struct from
gno-eth-ibc's `relayer/eth/erc20.go`; the generator is
`scripts/reference-vector.go`. To regenerate, run it inside that project's
`relayer` module with `eth/abi/ICS20Transfer.json` and save stdout to
`tests/fixtures/send-transfer-vectors.json`. Fixtures were captured from the
public testnet on 2026-10-22. No tests broadcast transactions.

`npm run check:live` performs read-only public RPC and CORS checks. Browser
adapter tests use wallet stubs, never real keys. Browser-wallet acceptance
testing is an operator step; see the runbook's small-transfer checklist.

Deployment is an operator step: see [the Caddy snippet](deploy/Caddyfile.snippet)
and [runbook section](deploy/RUNBOOK-section.md). Copy the contents of dist
to `/opt/gnoibc/bridge-ui/`, merge the site block, validate, and reload Caddy.

This is testnet software. Real extension approvals and live signed end-to-end
transfers require browser-wallet acceptance testing. Public RPC availability
and relayer/governance state affect timing. The route uses uint256 token
amounts but caps transfers at 2^96−1; gno native amount plus fee must fit
2^63−1. Each build supports one configured route and its token list. Replacement
clients, recovery decisions, Ethereum queued refunds, and governance losses
require operator support. Timeouts need relayer proofs, not just elapsed time.
