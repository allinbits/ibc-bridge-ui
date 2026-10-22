## Bridge web app

URL: https://bridge.2-29-108-12.sslip.io. Static Vite/React application; no
service, backend, server keys, or environment secrets. It talks directly to
the public gno and Sepolia RPCs. Wallets sign in the browser.

Build with Node >=22.12: `npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build`.
Copy the **contents** of `dist/` to `/opt/gnoibc/bridge-ui/` (the index must be
`/opt/gnoibc/bridge-ui/index.html`). Retain the previous release for rollback;
stage and switch releases together so index.html and hashed assets match.
The Caddy service account needs read and directory traversal permissions.

Add the bridge site block from `deploy/Caddyfile.snippet` to the existing
Caddyfile. The RPC currently permits wildcard browser access. The same file
includes an optional named `bridge_rpc_cors` snippet to permit only the
bridge origin: define the snippet at top level, and **replace** the RPC
site's existing reverse_proxy with `import bridge_rpc_cors`. This suppresses
the node's wildcard CORS response. Restricting CORS also restricts other
browser clients (such as an external dashboard); CLI clients are unaffected.

As the server operator, validate the complete file with
`caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`, then reload
Caddy. No new systemd service is needed. Existing sslip.io certificate notes apply.

After installation:

- Open the bridge, verify route fees and balances load, and check the browser
  console for CORS/CSP errors. `npm run check:live` checks the public RPCs,
  both gno CORS POST and OPTIONS, decimals, and a known historical transfer.
- Connect Adena, approve adding/switching to `test-ibc-1`, and fund it at the
  gno faucet. Connect MetaMask or Keplr's EVM provider and switch to Sepolia.
- Mint TERC with Sepolia ETH for gas; transfer a small permitted amount in
  each direction. Approve both TERC and returning GNOT vouchers on Ethereum.
- gno → Sepolia: delivery ~1–2 min; acknowledgement ~15 min. Returning TERC
  is blocked while `reserved("client-0", TERC)` is nonzero; wait ~20 min.
- Sepolia → gno: finality/relay ~15–20 min, then **Claim with Adena**.
  The claim fee is deducted from the receive amount. Claim pays the route's
  denom queue (up to 20 entries); meter limits and holds can require retries.

Activity is localStorage scoped to each participating address and origin.
Reload and reconnect to resume polling. Clearing browser data loses this
history; chain records and open claims remain. An edited receiver appears
in that receiver's claims, not necessarily the connected Adena account.
gnoweb links open the realm's send/claim records; transaction hashes also
link to tm2's transaction result because this gnoweb does not expose a
transaction detail page.

Troubleshooting: `GnoLimitsNotSet` requires governance; `GnoRoutePaused` or
`GnoQuarantined` requires an operator or delay; `GnoEscrowReserved` needs the
outbound acknowledgement; min/max errors require a permitted amount. Queued
gno refunds have a ClaimRefunds button. Ethereum refunds/recovery, governance
reductions, and route/client replacements require operator assistance. A
two-hour packet timeout needs a relayer proof to settle; passing the time
alone does not refund. RPC outages leave the last state visible and retry.

Rollback by restoring the previous static release. Rebuild after changing
RPC endpoints/contracts in `src/lib/config.ts`; keep the Caddy CSP in sync.
Never put mnemonics or private keys in the frontend or build environment.
