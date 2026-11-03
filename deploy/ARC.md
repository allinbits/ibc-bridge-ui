# Arc instance

This is a separate static build for `test-arc-1` ↔ Arc Testnet, served from
https://bridge-2.2-29-108-12.sslip.io. The Sepolia site continues to use a
plain `npm run build`. No server or wallet secrets belong in either build.

## Configure and build

After deploying gno-eth-ibc on Arc, from this worktree:

```sh
npm ci
npm run config:arc -- /Volumes/Tendermint/gnolang/gno-eth-ibc-arc/contracts/deployments/5042002.json ./arc.local.json
npm run lint
npm run typecheck
npm test
VITE_BRIDGE_ROUTE=arc VITE_BRIDGE_CONFIG=./arc.local.json npm run build
```

The generator reads the deployment script's flat JSON: `chainId`,
`gnoChainId`, `counterpartyClientId`, `clientId`, `ics26Router`,
`ics20Transfer`, and `ugnotVoucher`; it also carries `gnoLightClient` and
`ibcAdmin` when present. It validates chain/client IDs and nonzero addresses,
then writes the frontend config with a token list. Review that file against
the deployed contracts before building. It refuses to overwrite an existing
file; choose a new filename when regenerating. `*.local.json` is gitignored.
The test fixture is synthetic and must not be used for deployment.

Alternatively, point `VITE_BRIDGE_CONFIG` directly at the deployment JSON;
GNOT and USDC are then filled in automatically. With no deployment file an
Arc build fails, so it cannot accidentally use Sepolia contracts. Unknown
route names fail too. The two `VITE_` variables can also be in a gitignored
`.env.production.local`; unset them/remove that file for a Sepolia build.
There is no runtime route switch. Rebuild after configuration changes.

The selected configuration sets:

| Setting | Arc build |
| --- | --- |
| gno chain / transfer client | `test-arc-1` / `arc-1` |
| gno RPC | `https://rpc-2.2-29-108-12.sslip.io` |
| gnoweb / faucet | `https://gnoweb-2.2-29-108-12.sslip.io` / `https://faucet-2.2-29-108-12.sslip.io` |
| EVM chain / router client | `5042002` (`0x4cef52`) / `client-0` |
| Browser and wallet EVM RPC | `https://rpc.testnet.arc.io` |
| Native wallet gas currency | USDC, **18 decimals** |
| Explorer | `https://testnet.arcscan.app` |
| Test funds | `https://faucet.circle.com` (select Arc Testnet) |

Adena adds/switches the `test-arc-1` custom network. MetaMask and Keplr EVM
add/switch Arc with the metadata above. The transfer/claim realms and ABI
are shared with Sepolia. Arc's instant BFT finality needs no Ethereum beacon
chain or 15–20 minute finality wait. Delivery and acknowledgements normally
take seconds; activity refreshes every 15 seconds. A Claim transaction with
Adena is still required for incoming tokens. Escrow reservations are checked
for each returning EVM token; an acknowledgement must release them first.

## Tokens

`tokens` is an object keyed by symbol. GNOT must use the deployed
`ugnotVoucher` address with `denom: "ugnot"`, `decimals: 6`. USDC must use
`0x3600000000000000000000000000000000000000` with **6 ERC20 decimals**.
The ERC20 balance/allowance/transfer path is used for USDC; native gas is
handled by the wallet separately. GNOT and USDC have no public mint button.
Use Circle's faucet for USDC and the separate gno faucet for native GNOT.

To add a test ERC20 later, retain those two entries and add, for example:

```json
"TST": {
  "symbol": "TST",
  "address": "<deployed ERC20 address>",
  "decimals": 18,
  "denom": "ibc/<uppercase SHA256 of transfer/arc-1/<lowercase ERC20 address>>"
}
```

Use the token's actual decimals and a denom enabled by gno governance. The
build validates the hash and rejects duplicate addresses/denoms. To compute
it locally (replace the address), use:

```sh
node --experimental-strip-types --input-type=module -e 'import { voucherDenom } from "./src/lib/routes.ts"; console.log(voucherDenom("arc-1", "0xYOUR_TOKEN_ADDRESS"))'
```

Token selection, balances, amounts, claim labels, ERC20 approvals, voucher
burns, and escrow checks all follow this list. An optional
`"mint": {"amount": "1000000000000000000000", "label": "1,000 TST"}` enables
the existing `mint(address,uint256)` test button only for a token with that
public method. Amounts are base units. Frontend configuration does not
register tokens or enable route limits on either chain.

## CSP and deployment

For the Arc site, use the same strict policy as the Sepolia snippet, with
this `connect-src`:

```text
connect-src 'self' https://rpc-2.2-29-108-12.sslip.io https://rpc.testnet.arc.io
```

Full header value:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://rpc-2.2-29-108-12.sslip.io https://rpc.testnet.arc.io; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
```

The frontend only uses the official Arc RPC; it requests no `eth_getProof`
or consensus certificates. The relayer's proof RPC is separate. If the
frontend RPC is changed in the route definition to
`https://rpc.blockdaemon.testnet.arc.io`, allow that origin in `connect-src`
as well (or replace the official origin if no longer used). Faucet,
explorer, and gnoweb links are ordinary external navigation and need no
`connect-src` entry. The gno RPC must allow the bridge-2 origin through CORS
for JSON POST and OPTIONS. Do not apply the Sepolia CORS snippet verbatim to
rpc-2: use bridge-2's origin and rpc-2's upstream.

Copy the **contents** of this build's `dist/` to a separate release directory,
for example `/opt/gnoibc/bridge-ui-arc/`, and point only the bridge-2 Caddy
site at it. Keep Sepolia's document root and CSP as they are. Follow the
[existing runbook](RUNBOOK-section.md) for atomic release switching, Caddy
validation/reload, and rollback. A later build replaces local `dist/`, so
stage each route's artifacts separately. No server changes are made by the
build scripts.

## Acceptance after contracts and realms are deployed

```sh
VITE_BRIDGE_ROUTE=arc VITE_BRIDGE_CONFIG=./arc.local.json npm run check:live
VITE_BRIDGE_ROUTE=arc VITE_BRIDGE_CONFIG=./arc.local.json npm run preview
```

The read-only live check verifies gno render/claims/sends, all configured
token denoms, ERC20 decimals, escrow reservations, chain ID, and RPC CORS.
The historical Sepolia transaction check runs only for the Sepolia route.

On bridge-2, check the console for CSP/CORS failures, add/switch both wallet
networks, fund gas, and transfer a small permitted amount of GNOT and USDC
in each direction. Approve the exact ERC20 amount on Arc, claim incoming
tokens with Adena, and confirm the matching packet/acknowledgement and
explorer links. Reload/reconnect to check activity recovery. History is
isolated by origin and route; the Sepolia storage keys remain unchanged.
Real extension signing and round trips require the deployed contracts,
registered denoms/limits, active route, and running relayers.
