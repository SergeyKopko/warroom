# WARROOM

React + Solidity implementation of WARROOM for Robinhood Chain.

## Included

- Commander ERC-721 collection, capped at 1,200 NFTs.
- Progress is stored by `tokenId`, so rank, missile level, hits and damage move with the NFT on transfer.
- Every WAR payment uses one contract function: 50% is sent to `0x…dEaD`, 50% to the configured treasury.
- Free launch every four hours and up to three extra launches per UTC day for 10,000 WAR each.
- Missile upgrades, earned promotions, purchased ranks through Colonel, and a General entry point capped at ten seats.
- One global target with immediate reset at zero HP.
- Five-hour PLTR reward rounds. The contract pulls the WAR launch's Pons V2 Creator Fees from Fee Escrow, freezes participation weight on the first launch, and pays the round closer 0.5%.
- Claimable PLTR is calculated per NFT and per round.
- React Activity feed decoded from contract events, with automatic polling and explorer links.
- Accurate event timestamps for the current RPC window and one-transaction PLTR claiming across multiple Commanders.
- Complete local demo mode when no game address is configured.
- The supplied v19 tactical interface, motion system, responsive layout and WARROOM brand asset.

## Run locally

```bash
npm install
npm run dev
```

The app opens in demo mode. Every button is functional without a wallet. Demo state is saved in `localStorage`.

## Connect a deployment

1. Launch WAR through Pons V2 with official PLTR as the quote asset.
2. Configure the deployed `WarroomGame` contract as the launch's creator-fee recipient. This lets `pullCreatorFees()` claim PLTR from Pons Fee Escrow.
3. Copy `.env.example` to `.env` and set `WAR_TOKEN_ADDRESS`, `TREASURY_ADDRESS`, `ADMIN_ADDRESS` and `PRIVATE_KEY`.
4. Run `npm run contracts:build`, audit the contract, then run `npm run contracts:deploy`.
5. Put the deployed address in `VITE_WARROOM_GAME_ADDRESS`, rebuild the frontend, and verify the contract on Blockscout.

Official mainnet values already configured in the project:

- Robinhood Chain: `4663`
- PLTR Robinhood Token: `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A`
- Pons V2 Fee Escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`

## Production notes

- Do not deploy to mainnet before an independent smart-contract audit.
- The MVP launch result uses block entropy. Replace it with the chosen production randomness/oracle mechanism before funds are at risk.
- `enterGeneralTrial()` is the integration point for the final General challenge. The current MVP immediately admits an eligible Colonel after the WAR payment; define the actual trial rules before mainnet.
- The public Robinhood RPC limits log ranges. The UI polls recent events; use an archive RPC or event indexer/database for permanent global Activity history.
- Set the NFT metadata base URL after deployment with `setBaseURI()`.
- PLTR Stock Token availability and transfers can be jurisdiction-restricted.
- The displayed Creator Fees value is the amount already swept into Pons V2 Fee Escrow. Pons can also have unswept fees on the launch curve or graduated hook; the launch deployer/sweep operator must sweep those before a WARROOM round can claim them.
