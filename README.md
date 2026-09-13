# WARROOM

React application, Solidity game contract and a shared on-chain Activity indexer for Robinhood Chain.

## Architecture

```text
WarroomGame (fixed address on Robinhood Chain)
        │ HTTP catch-up + WebSocket new-block signal
        ▼
Activity indexer ── confirmations/reorg check ──► Neon PostgreSQL
        │                                           │
        │                                    parameterized SQL
        │                                           ▼
        └────────────────────────────── GET /api/activity
                                             │
                                             ├── cursor history
                                             └── /stream (SSE)
                                                    │
                                                    ▼
                                             React Activity feed
                                      dedupe · pending→confirmed · mine
```

The database is the common source for every visitor. A wallet is not required to load history or receive new events. When a wallet is connected, the same rows are compared with `actor` and marked `mine` in the interface.

Before `WARROOM_GAME_ADDRESS` and `DEPLOYMENT_BLOCK` are configured, the deployed API intentionally returns an empty shared feed and SSE heartbeats. The production frontend shows only real wallet balances, creates no simulated Commanders or Activity rows, and keeps transaction actions disabled. It never guesses or accepts a contract address from a visitor. The interactive simulation is available only from Vite's local development build.

The indexer accepts no contract address or prebuilt Activity row from a client. It only reads `WARROOM_GAME_ADDRESS`, decodes the known ABI and inserts events with a unique `(chain_id, contract_address, transaction_hash, log_index)` constraint. Events without an owner field use the sender of their on-chain transaction as `actor`.

## Activity behavior

- Initial history loads from `GET /api/activity?limit=100`.
- Older history uses an opaque `cursor`; missed new rows use `after`. `limit` is capped at 100.
- Optional filters are `type` (Activity kind or ABI event name), `commanderId` and `actor`. `wallet` only controls the `mine` marker and does not filter the global feed.
- `/api/activity/stream` provides Server-Sent Events and reconnects automatically.
- A reconnect first requests all events after the last cursor.
- While realtime is unavailable, the browser polls every 3–5 seconds.
- New rows are merged at the top without a reload and are deduplicated by stable event ID.
- A submitted wallet transaction immediately creates a local `pending` row. The confirmed indexed event with the same transaction hash replaces it.
- The long-running indexer uses WebSocket block notifications. If the provider disconnects it catches up over HTTP, retries with exponential backoff and keeps a four-second HTTP polling fallback active.
- Each history/stream request also attempts a bounded HTTP catch-up. A PostgreSQL lease prevents duplicate scans across Vercel instances; stale leases expire automatically.

Indexed ABI events: `CommanderMinted`, `MissileLaunched`, `MissileUpgraded`, `RankUpgraded`, `TargetDestroyed`, `CreatorFeesPulled`, `RoundClosed` and `RewardsClaimed`.

Example filters:

```text
/api/activity?limit=50&type=launch
/api/activity?commanderId=174
/api/activity?actor=0x...
/api/activity?after=<opaque-cursor>
```

Each item includes its stable ID, kind and event name, optional Commander and actor, display title/detail, Unix block time, block number, transaction hash, plus both `status` and `confirmed`. Server rows are final-confirmation events; the browser-only row is `pending` until a matching indexed transaction arrives.

## Neon setup

1. Create a Neon PostgreSQL project and copy its pooled connection string.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Apply migrations:

   ```bash
   pnpm db:migrate
   ```

4. To create a migration, add the next numbered SQL file under `db/migrations/`, for example `002_add_event_metadata.sql`, then run the same command. Applied filenames are recorded in `schema_migrations`.

The first migration creates `activity_events`, indexes for block number/time, Commander, actor, kind and transaction/log identity, `indexer_state` checkpoints, and the short-lived `indexer_locks` table used for cross-instance scanning leases.

## Environment variables

Server-only variables have no `VITE_` prefix. Vite intentionally embeds only the public `WARROOM_GAME_ADDRESS` and `WAR_TOKEN_ADDRESS`. Database credentials, RPC provider URLs, Redis tokens and the indexer secret never enter the frontend bundle.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Neon connection string |
| `ROBINHOOD_RPC_HTTP` | yes | HTTP RPC used for catch-up and reorg verification |
| `ROBINHOOD_RPC_WS` | recommended | WebSocket RPC used for realtime block notifications |
| `WARROOM_GAME_ADDRESS` | yes after deployment | The one contract address the indexer is allowed to read |
| `DEPLOYMENT_BLOCK` | yes | First block that can contain WARROOM events |
| `INDEXER_CONFIRMATIONS` | yes | Confirmation depth; `12` is the example value |
| `INDEXER_SECRET` | yes | Protects the manual catch-up endpoint |
| `UPSTASH_REDIS_REST_URL` | production | Upstash REST endpoint for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | production | Upstash token; server only |
| `ALLOWED_ORIGINS` | production | Comma-separated exact origins allowed by CORS |

Contract tooling also accepts the public `WAR_TOKEN_ADDRESS`, `TREASURY_ADDRESS`, `ADMIN_ADDRESS`, `PONS_FEE_ESCROW` and `PLTR_TOKEN_ADDRESS`. `WAR_TOKEN_ADDRESS` is currently set to the real Robinhood Chain ERC-20 supplied for this stage, `0x48a9E2ec1EaD16C709e1187ac13e7434f9B21a16`; the UI intentionally calls it WAR. Replace only this address when the final WAR contract is ready. No private key is read, stored or required by the application or indexer.

Verify the configured token's read-only ERC-20 interface and required 18 decimals with `pnpm token:verify`. This sends no transaction and requests no wallet signature.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm indexer
```

In a second terminal, run the frontend and Vercel API routes together:

```bash
pnpm dev:full
```

`pnpm dev` still runs the frontend-only interactive demo. In that mode the Activity client safely falls back when `/api/activity` is unavailable.

## Running and recovering the indexer

Run `pnpm indexer` as one long-lived process on a worker host. It reads blocks in bounded batches, saves the last fully indexed block/hash, and never needs a signing key.

On restart it resumes at `last_scanned_block + 1`. If the stored hash is no longer canonical, it deletes the potentially orphaned range, rewinds past the confirmation window and indexes forward again. To force a normal catch-up without restarting the worker:

```bash
curl -X POST https://YOUR_DOMAIN/api/indexer/catch-up \
  -H "Authorization: Bearer $INDEXER_SECRET"
```

This endpoint does not accept event data. It only asks the server to read the configured contract from the configured RPC.

For a full rebuild, stop the indexer, delete the rows and checkpoint for chain `4663` and the configured contract in Neon, then restart. Do this only during maintenance because Activity will refill from `DEPLOYMENT_BLOCK`.

## Vercel setup

1. Import the repository into Vercel.
2. Keep the framework preset as Vite; `vercel.json` sets `pnpm build` and `dist`.
3. Add every server variable from the table to Preview and Production environments. Use exact production origins in `ALLOWED_ORIGINS`.
4. Attach Upstash Redis and use its REST URL/token for consistent rate limiting across function instances.
5. Deploy the web/API project.
6. Run the indexer on a long-lived worker service with the same `DATABASE_URL`, RPC values, game address, deployment block and confirmation count. Vercel Functions also catch up on Activity requests, but are not treated as a permanent WebSocket process.

## Free-tier constraints

- Neon free projects can suspend when idle and have compute/storage quotas. The first request after suspension may be slower.
- Vercel Functions have execution-duration and concurrent-connection limits. The SSE route deliberately closes after about 22 seconds; EventSource reconnects and catches up by cursor. Heavy traffic may require a dedicated realtime service.
- Upstash free Redis has daily command limits. When it is not configured, a local in-memory limiter is used, but that fallback is per function instance and is not sufficient for production abuse protection.
- Public Robinhood RPCs are rate-limited and may cap log ranges. Use a production HTTP/WS provider for the indexer.

Check the current limits in each provider dashboard before launch because free-tier quotas can change.

## Connecting WarroomGame after deployment

1. Independently audit `WarroomGame`. The owner may then open `/deploy`, connect the configured `ADMIN_ADDRESS`, review every constructor value and sign the deployment in their injected wallet. The page never receives or stores a private key.
2. Verify the contract on Robinhood Chain Blockscout.
3. Set `WARROOM_GAME_ADDRESS` to that verified address and `DEPLOYMENT_BLOCK` to its deployment block in Vercel and the indexer worker.
4. Redeploy the frontend/API so the public address is embedded in the client build.
5. Apply the Neon migration and start `pnpm indexer`.
6. Open `/api/activity?limit=1` and confirm a JSON response, then submit a testnet transaction and verify `pending → confirmed` in Activity before using mainnet.
7. Configure the deployed game contract as the Pons V2 creator-fee recipient for the WAR/PLTR launch.

The constructor stores the production NFT metadata base URI. `/api/metadata/:tokenId` reads the current Commander state from chain and exposes rank, missile level, hits, launches, damage and WAR spending/burn attributes alongside `public/commander-nft.png`.

For the current Robinhood mainnet deployment, pass the configured `WAR_TOKEN_ADDRESS` into the immutable `war_` constructor argument; the site intentionally keeps displaying the symbol `WAR`. Local Solidity integration tests use an isolated mintable ERC-20 double so mint/burn/treasury behavior can be verified without spending or impersonating holders of the live token. That test contract is never deployed or bundled into production.

Official values already present in contract configuration:

- Robinhood Chain: `4663`
- WarroomGame: `0xE0061A192b93546BeC4A2f4Da41E7E0fB344780d` (deployed at block `61815288`)
- PLTR Robinhood Token: `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A`
- Pons V2 Fee Escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`

## Security controls

- Query values are length/type/range validated before database access.
- SQL uses positional parameters; no user value is concatenated into a query.
- Activity ingestion is chain-only; clients cannot submit event rows.
- The manual catch-up endpoint verifies `INDEXER_SECRET` with constant-time comparison.
- No webhook or client ingestion route exists, so there is no unsigned webhook payload to trust.
- The contract address is fixed by server configuration.
- CORS echoes only exact allowlisted origins.
- Upstash provides distributed sliding-window rate limiting in production.
- No private keys are stored or used.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

The tests cover all eight indexed event decoders, deduplication, pending replacement, cursor pagination/filter validation, checkpoint continuation, reorg rewind, realtime reconnect/catch-up, walletless Activity, realtime-to-polling fallback, and local EVM integration for NFT minting, mint-more, free/extra launches, rank spending, cooldown, and exact 50/50 WAR burn/treasury splits.
