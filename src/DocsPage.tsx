import type { ReactNode } from 'react'
import { MISSILES, RANKS } from './config'

const PAIR = 'WAR / PLTR'
const CHAIN = { name: 'Robinhood Chain', id: 4663 }
const ROUND_HOURS = 5
const CLERK_FEE = 0.5
const GENERAL_TRIAL_PRICE = 800_000
const ENEMY_MAX = 200_000

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

const toc = [
  ['what', 'What Warroom is'],
  ['nft', 'The Commander NFT'],
  ['war', 'WAR and the burn'],
  ['launch', 'Launching'],
  ['target', 'The target and the cycle'],
  ['missile', 'Missile levels'],
  ['rank', 'Rank'],
  ['buy', 'Buying a rank'],
  ['seats', 'Capped seats'],
  ['general', 'General entry'],
  ['rewards', 'Rewards and claiming'],
  ['network', 'Network and wallets'],
  ['contracts', 'Contracts'],
  ['risk', 'What can go wrong'],
  ['faq', 'FAQ'],
  ['legal', 'Legal'],
] as const

const faqItems: Array<[string, string]> = [
  ['Do I need a Commander NFT to play?', 'Yes. It is the pass into the game and the place your progression lives. Without one you can watch the war and read the docs, but you cannot launch.'],
  ['What happens when all 1,200 are minted?', 'Minting closes permanently. The only way in after that is buying a Commander from another holder. Its on-chain rank, missile level, hits and damage move with the NFT.'],
  ['Can I buy my way to General?', `Not through the ordinary rank-buy button. A Colonel can enter the MVP General trial for ${fmt(GENERAL_TRIAL_PRICE)} WAR while one of the ten seats is free.`],
  ['Is buying a rank worse than earning it?', 'It is faster and more expensive. The resulting rank and reward multiplier are otherwise identical.'],
  ['What counts as active?', `One launch since the previous round closed. The round is the window, not a rolling day — and a free launch counts exactly the same as a paid one.`],
  ['How often do rewards settle?', `A round can close every ${ROUND_HOURS} hours. Each NFT locks its weight on its first launch in that round, and the close records the shared reward total.`],
  ['Do I have to claim every round?', 'No. Credits accumulate on your NFT and never expire. Claim once a week or once a month and everything comes out in a single transaction.'],
  ['I sold my Commander before claiming. Who gets the rewards?', 'Claim rights stay with the Commander NFT. The current token owner can claim its unclaimed eligible rounds.'],
  ['What happens if nobody is active in a round?', 'The entire pool rolls into the next round. Nothing is lost and nothing is stuck.'],
  ['Who actually closes a round?', `Anyone. Once the timer runs out any wallet can send the transaction and keeps ${CLERK_FEE}% of the available pool for it when the round has active weight.`],
  ['What if the team disappears?', 'Round closing remains open to any wallet and pays a fee when funds and active weight are available, so settlement does not depend on a backend signer.'],
  ['Does missile level change my rewards?', 'No. Missile level is damage. Rank is rewards. The two never mix.'],
  ['Where does the war chest money come from?', 'Reward fees taken from trading volume. Every trade of WAR on the AMM pays a fee, and a share of it is routed into the pool. It is never funded by minting new WAR.'],
  ['What are rewards paid in?', 'PLTR. The contract accumulates tokenized PLTR and credits it in PLTR at the close of every round.'],
  ['What happens when the target reaches zero HP?', 'It is destroyed and immediately rebuilt at full strength, and the cycle counter goes up. Your rank, missile, hits and seat all carry over untouched.'],
  ['How many Commanders can one wallet hold?', 'As many as you can get. Pick a quantity when you mint, come back and mint more at any time, or buy them on the secondary market — there is no per-wallet limit. Only the collection total of 1,200 is fixed.'],
  ['Can I mint several at once?', 'Yes. Choose the quantity in the mint dialog and it settles in one transaction, at 100,000 WAR each with half of the total burned.'],
  ['Do several Commanders share progress?', 'No. Each is its own character with its own rank, missile level, hits, damage and credited rewards. You pick which one you are playing as, and you can switch at any time.'],
  ['How are rewards calculated if I hold several?', 'Separately for each NFT. A wallet with a Recruit, a Colonel and a General holds three weights — 1.0x, 2.5x and 4.0x — and gets three credits. You can withdraw them all in one transaction.'],
  ['Do all my Commanders count as active if I launch once?', 'No. Activity is per NFT. Each Commander needs its own launch since the previous round closed, or its weight for that round is zero.'],
  ['Can one wallet hold more than one General seat?', 'Yes, if it wins more than one. Seats are capped per NFT, not per owner, and the MVP has no rule against it.'],
  ['Is the launch result decided in my browser?', 'No. The contract derives it on-chain from block data. This MVP mechanism is transparent but is not a substitute for a production VRF randomness oracle.'],
  ['Does the game mint more WAR?', 'No. The game contract only transfers existing WAR and sends half of each in-game payment to the burn address. Token supply policy itself belongs to the configured WAR token contract.'],
  ['Why are rewards paid in PLTR and not in WAR?', 'Because paying rewards in your own token is printing with extra steps. Separating the two means WAR only ever leaves circulation, and what you earn is an asset the protocol had to actually collect.'],
  ['What is the market pair?', `${PAIR}. WAR is quoted against tokenized PLTR, so the base asset of the ecosystem is the same asset the game pays out.`],
  ['Do I need PLTR to start?', `You need WAR to mint and to play, and the way to get WAR is the ${PAIR} pool. So in practice yes — PLTR is the way in.`],
  ['Which network and which wallets?', `${CHAIN.name}, chain ID ${CHAIN.id}. MetaMask and WalletConnect at launch. The site prompts you to switch networks automatically if you are somewhere else.`],
]

function Faq({ question, answer }: { question: string; answer: string }) {
  return <details className="faq"><summary>{question}</summary><div className="a">{answer}</div></details>
}

export function DocsPage({ contracts }: { contracts: ReactNode }) {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Docs</h1>
          <p>Everything Warroom does, written out in full: where the money comes from, what burns, how ranks work, and what can go wrong.</p>
        </div>
        <span className="eyebrow">Revision 0.1 · {CHAIN.name}</span>
      </div>
      <div className="docs">
        <nav className="toc" aria-label="Documentation sections">
          {toc.map(([id, title], index) => (
            <a href={`#${id}`} onClick={(event) => { event.preventDefault(); jump(id) }} key={id}>
              <i>{String(index + 1).padStart(2, '0')}</i>{title}
            </a>
          ))}
        </nav>
        <div className="doc">
          <section id="what">
            <h2>What Warroom is</h2>
            <p className="lead">Spend WAR to play. Earn PLTR as rewards. Every commander in the game shoots at the same target, lands hits, upgrades, climbs the ranks — and rank decides how large a slice of the reward pool you take.</p>
            <p>The two assets do two different jobs and never swap places. <b>WAR is the fuel:</b> minting, upgrading, buying rank and entering the General trial all cost WAR, and half of every in-game payment is burned. <b>Tokenized PLTR is the reward:</b> it is what the game contract holds and what a settled round credits to your NFT.</p>
            <p>That split is the point. A game that pays rewards in its own token is really just printing and calling it yield. Here the token you spend only ever leaves circulation, and what comes back is a different asset entirely.</p>
            <p>Nothing in the game creates yield, either. The pool is trading fees collected on the {PAIR} market and redistributed between NFT holders — if nothing trades, there is nothing to share. Rank changes the size of your slice, never whether a slice exists.</p>
            <p>The loop is short on purpose: <b>launch → land hits → upgrade and rank up → burn WAR → take a bigger slice of PLTR → come back tomorrow.</b> Everything else in these docs hangs off that line.</p>
          </section>

          <section id="nft">
            <h2>The Commander NFT</h2>
            <p>The Commander is an ERC-721 token and it is three things at once: your pass into the game, your profile, and the place your progression is stored. Rank, missile level, successful hits, total damage, WAR spent and WAR burned all live on the token.</p>
            <ul>
              <li><b>Supply is capped at 1,200.</b> There will never be a 1,201st Commander.</li>
              <li><b>No limit per wallet.</b> Mint several at once, come back and mint more later, or buy them on the secondary market. Distribution across owners is free; only the total is fixed.</li>
              <li><b>Each token is a separate character.</b> Rank, missile level, hits, damage, WAR burned and reward eligibility all belong to the token, not to the wallet. Two Commanders on one address progress completely independently.</li>
              <li><b>Rewards are settled per NFT.</b> A wallet holding a Recruit, a Colonel and a General has three separate weights and receives three separate credits — 1.0x, 2.5x and 4.0x. Nothing is pooled at the wallet level except the convenience of claiming it all in one transaction.</li>
              <li><b>Capped seats are counted in NFTs, not owners.</b> One wallet may in principle hold more than one General seat if it wins more than one. There is no rule against it in the MVP.</li>
              <li><b>Mint price is 100,000 WAR</b>, of which half is burned on the spot and half is transferred to the configured treasury.</li>
              <li><b>One Commander gets you into the game.</b> You start as a Recruit with a Level 1 missile and can launch immediately.</li>
              <li><b>Progress follows the NFT.</b> Sell or gift the token and its rank, missile level, hits, damage and unclaimed eligible rounds remain attached to that Commander.</li>
            </ul>
            <p>That last rule is important: a buyer receives the Commander's existing on-chain progress. If all 1,200 are minted, the only way in is to acquire an existing NFT from another holder.</p>
            <p>Holding several is a real strategy rather than an oversight: each Commander needs its own launch to count as active in a round, so ten Commanders means ten launch transactions every round. Weight scales with what you hold, and so does the work.</p>
            <p>Full mint burns <b>{fmt(1_200 * 100_000 * 0.5)} WAR</b> — 1,200 × 100,000 × 50% — before anyone has fired a single missile.</p>
          </section>

          <section id="war">
            <h2>WAR, the pair and the burn</h2>
            <p>WAR is the configured ERC-20 fuel token. The game never mints WAR and rewards are never paid in it. For each supported in-game payment, the game sends half to the burn address and half to the configured treasury.</p>
            <p>The market pair is <b>{PAIR}</b>. WAR is quoted against tokenized PLTR rather than against a stablecoin or a network asset, which means the base asset of the ecosystem is the same thing the game pays out. You buy WAR with PLTR, spend it to play, and earn PLTR back through rank.</p>
            <p>Every WAR spent inside the game follows the same rule: <b>50% is burned</b>, and the remainder is transferred to the configured treasury address.</p>
            <table>
              <thead><tr><th>Spend</th><th>Cost</th><th>Burned</th></tr></thead>
              <tbody>
                <tr><td>Mint a Commander</td><td className="num">100,000</td><td className="num rep">50,000</td></tr>
                <tr><td>Extra launch</td><td className="num">10,000</td><td className="num rep">5,000</td></tr>
                <tr><td>Missile upgrades (all four levels)</td><td className="num">700,000</td><td className="num rep">350,000</td></tr>
                <tr><td>Earned promotions to Colonel</td><td className="num">1,300,000</td><td className="num rep">650,000</td></tr>
                <tr><td>Bought ranks to Colonel</td><td className="num">3,250,000</td><td className="num rep">1,625,000</td></tr>
                <tr><td>General trial entry</td><td className="num">800,000</td><td className="num rep">400,000</td></tr>
              </tbody>
            </table>
            <p>The General trial is the largest single WAR sink. Like every other in-game payment, half of its cost is burned permanently.</p>
          </section>

          <section id="launch">
            <h2>Launching</h2>
            <p>One free launch every <b>4 hours</b>. Unused launches do not stack — if you leave the slot idle, it is simply gone.</p>
            <p>Each launch resolves one of two ways. <b>Target hit</b> deals your missile's damage to the global enemy and counts as a successful hit toward upgrades and promotions. <b>Intercepted</b> deals nothing and counts for nothing.</p>
            <p>Not willing to wait, you can pay <b>10,000 WAR</b> for an extra launch — up to three a day. An extra launch is identical to a free one in every respect except that you paid for it.</p>
            <p><b>The result is never decided by the front end.</b> The contract derives it from current block data and records the outcome on-chain. The MVP does not yet use a dedicated VRF oracle, so this mechanism must be reviewed before a high-value production launch.</p>
          </section>

          <section id="target">
            <h2>The target and the cycle</h2>
            <p>Every commander shoots at the same target. It starts each cycle with <b>{fmt(ENEMY_MAX)} HP</b>, and every hit anyone lands takes that number down.</p>
            <p>When it reaches zero the target is <b>destroyed and instantly rebuilt</b> at full strength. The cycle counter goes up by one and everybody keeps playing without interruption. Nothing about your commander changes at a reset: rank, missile level, hits, damage and any seat you hold all carry straight over.</p>
            <p>The target exists to give a launch visible meaning and to make the damage counter shared. It does not pay anything by itself — rewards come from trading fees, and your share of them comes from rank.</p>
          </section>

          <section id="missile">
            <h2>Missile levels</h2>
            <p>Your missile level decides one thing: how much damage a hit does. It does not affect your rewards, your rank or your chance of getting through.</p>
            <table>
              <thead><tr><th>Level</th><th>Damage</th><th>Requires</th><th>Cost</th><th>Burned</th></tr></thead>
              <tbody>
                {MISSILES.map((m) => (
                  <tr key={m.level}>
                    <td style={{ fontWeight: 600 }}>Level {m.level}</td>
                    <td className="num">{m.damage.toLocaleString()}</td>
                    <td className="num">{m.hits ? `${m.hits} hits` : 'issued at mint'}</td>
                    <td className="num">{m.cost ? Number(m.cost / 10n ** 18n).toLocaleString() : '—'}</td>
                    <td className="num rep">{m.cost ? Number(m.cost / 2n / 10n ** 18n).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Upgrades are sequential — you cannot skip from Level 1 to Level 4 — and they are permanent.</p>
          </section>

          <section id="rank">
            <h2>Rank</h2>
            <p>Rank decides one thing: how large your share of each reward round is. It has no effect on damage.</p>
            <table>
              <thead><tr><th>Rank</th><th>Hits</th><th>Time since mint</th><th>Earn it</th><th>Buy it</th><th>Seats</th><th>Rewards</th></tr></thead>
              <tbody>
                {RANKS.map((r) => (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="num">{r.hits || '—'}</td>
                    <td className="num">{r.days ? `${r.days}d` : '—'}</td>
                    <td className="num">{r.earned ? Number(r.earned / 10n ** 18n).toLocaleString() : '—'}</td>
                    <td className={`num ${r.buy ? 'amb' : ''}`}>{r.buy ? Number(r.buy / 10n ** 18n).toLocaleString() : '—'}</td>
                    <td className="num">{r.seats ?? 'unlimited'}</td>
                    <td className="num amb">{(Number(r.multiplier) / 100).toFixed(1)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Earning a rank means three things at once: the hits, the days, and the promotion fee. All three have to be satisfied, and half of the fee burns.</p>
            <p><b>General is not on the ordinary ladder.</b> A Colonel uses the separate General-trial action while a seat is available.</p>
          </section>

          <section id="buy">
            <h2>Buying a rank</h2>
            <p>Captain, Major and Colonel can be bought outright with WAR from the day you mint, skipping both the hits and the wait. Half of the purchase burns like any other spend.</p>
            <ul>
              <li>Ranks are bought <b>one step at a time</b> — Recruit to Colonel is three purchases, not one.</li>
              <li>You <b>cannot buy into a full rank</b>. The transaction reverts when its seat cap has been reached.</li>
              <li>Earned and purchased promotions emit the same rank event with an on-chain flag showing which route was used.</li>
            </ul>
            <p>The purpose of the split is not to punish spending. It is to keep money and work as two different routes with two different costs, so a large balance buys speed but never buys the top of the game.</p>
          </section>

          <section id="seats">
            <h2>Capped seats</h2>
            <p>Three ranks have a fixed number of chairs: <b>100 Majors, 30 Colonels, 10 Generals</b>. The counters are visible on the rank screen at all times.</p>
            <p>While seats are free, Major and Colonel behave like other ladder ranks — earn them or buy them. Once the last seat is taken, new promotion into that rank reverts.</p>
            <p>General is capped at ten and uses a separate Colonel-only trial transaction. The current MVP has no player-versus-player seat challenge or eviction mechanic.</p>
          </section>

          <section id="general">
            <h2>General entry</h2>
            <p>A Commander must already be a Colonel. If fewer than ten Generals exist, its owner can enter the MVP General trial by paying <b>{fmt(GENERAL_TRIAL_PRICE)} WAR</b>.</p>
            <table>
              <thead><tr><th>Requirement</th><th>Cost</th><th>Burned</th></tr></thead>
              <tbody>
                <tr><td style={{ fontWeight: 600 }}>Colonel · open General seat</td><td className="num amb">{fmt(GENERAL_TRIAL_PRICE)} WAR</td><td className="num rep">{fmt(GENERAL_TRIAL_PRICE / 2)} WAR</td></tr>
              </tbody>
            </table>
            <p>The promotion is deterministic in this version: if the caller owns the Colonel, allowance and WAR balance are sufficient, and a seat is open, the transaction promotes immediately. There is no opponent, defense window or backend decision.</p>
            <p>This is explicitly the MVP trial rule. A future challenge system would require a separately reviewed contract upgrade and is not represented as active functionality here.</p>
          </section>

          <section id="rewards">
            <h2>Rewards</h2>
            <p>The pool is funded by <b>reward fees taken from trading volume</b>. Every time WAR changes hands on the AMM the protocol collects a fee, and a share of it is routed into the rewards contract. Mechanically this is the same thing a liquidity provider does when they collect fees on Uniswap: it is fee redistribution between NFT holders, not a return generated by the protocol.</p>
            <h3>The round</h3>
            <p>PLTR sits in the contract until a round closes. A round runs <b>{ROUND_HOURS} hours</b>. A Commander's reward weight is recorded when that specific NFT launches for the first time in the round.</p>
            <p><b>The first launch is the cut-off for that NFT's weight.</b> A later promotion affects its weight from the next round; an NFT that has not launched yet can promote first and then activate the new weight.</p>
            <h3>The share</h3>
            <p>Each active NFT gets the weight it recorded on its first launch. The formula is the whole of it:</p>
            <p className="lead"><b>your share = round pool × your recorded weight / total active weight</b></p>
            <p>Say the pool is 1.5 PLTR and the recorded weights add up to 1,525. A Colonel at 2.5 takes 2.5 / 1,525 of it — about 0.00246 PLTR. A General at 4.0 takes 0.00393 PLTR out of the same pool. Rank multiplies your slice; it does not make the pool bigger.</p>
            <h3>Claiming</h3>
            <p>Nothing is sent to you automatically — pushing PLTR to a thousand addresses every round would cost more in gas than most of the payouts. Instead each settled round <b>credits your NFT</b>, and the credits add up.</p>
            <p>When you claim, the contract pays the difference between everything ever credited to you and everything you have already withdrawn. Twenty missed rounds come out in <b>one transaction</b>, whenever you choose. Nothing expires.</p>
            <h3>Who closes the round</h3>
            <p>Somebody has to send the transaction that ends a round, and it should not have to be us. Once the timer runs out, <b>any wallet can trigger the close and keeps {CLERK_FEE}% of the pool</b> for the gas and the trouble. The remaining {(100 - CLERK_FEE).toFixed(1)}% is shared out as normal.</p>
            <p>This matters more than it looks. It means rounds can keep settling even if our servers are down, and liveness never depends on the team holding a backend private key.</p>
            <ul>
              <li><b>Active means one launch since the previous round closed.</b> Not a rolling day — the round itself is the window. One free launch inside a {ROUND_HOURS}-hour round is always enough.</li>
              <li><b>Miss a round and you are simply not in it.</b> No penalty beyond that; your credited balance stays untouched.</li>
              <li><b>An empty round rolls over.</b> If nobody qualifies, the whole pool moves into the next round rather than sitting idle.</li>
              <li><b>Rounding dust is carried, not stuck.</b> Whatever integer division leaves behind joins the next pool.</li>
              <li><b>Claim rights follow the NFT.</b> The current owner must sign the claim and can collect its unclaimed eligible rounds.</li>
            </ul>
            <p>Three consequences worth being explicit about. <b>Rewards are tied to trading volume</b> — a quiet week pays less at every rank, and zero volume pays zero to everyone including Generals. Rank multiplies your slice but does not add to the pool. And the pool is never funded by minting new WAR, because that would just move value from holders to players and call it a reward.</p>
          </section>

          <section id="network">
            <h2>Network and wallets</h2>
            <p>Warroom runs on <b>{CHAIN.name}</b>, chain ID {CHAIN.id}. Supported wallets at launch are MetaMask and WalletConnect.</p>
            <p>The front end detects your network automatically. If you are connected somewhere else you will see a <b>Switch to {CHAIN.name}</b> prompt, and approving it in your wallet moves you across.</p>
            <p>We never ask for your seed phrase, never hold your private keys, and cannot move anything out of your wallet without a transaction you signed yourself. Anyone asking you for a seed phrase in the name of Warroom is stealing from you.</p>
            <p>These actions are always on-chain: minting, every WAR spend, every burn, launches, missile upgrades, promotions, General entry, round closing and reward claims.</p>
          </section>

          <section id="contracts">
            <h2>Contracts</h2>
            <p>Addresses are published here and on the landing page as soon as each contract is deployed and verified. Until then the slots below read as undeployed, and any address circulating elsewhere is not ours.</p>
            {contracts}
          </section>

          <section id="risk">
            <h2>What can go wrong</h2>
            <ul>
              <li><b>Rewards depend on trading volume.</b> No volume means no fees, an empty chest and zero payouts at every rank, General included. Buying in during a busy week means watching payouts fall when the volume does.</li>
              <li><b>Weight follows what you hold.</b> A wallet with ten Commanders takes ten shares of the same pool, which dilutes everyone holding one. The counterweight is work: every one of those ten needs its own launch every round.</li>
              <li><b>Progress transfers with the NFT.</b> Selling a Commander also transfers its rank, hits, missile level and unclaimed eligible rounds to the buyer.</li>
              <li><b>Seats run out.</b> Major, Colonel and General promotions revert after their configured caps are filled; the MVP has no eviction mechanic.</li>
              <li><b>Spending is one-way.</b> Nothing you burn comes back, and there is no refund on a rank, a missile or a mint.</li>
              <li><b>Randomness can be unkind.</b> Roughly one launch in three is intercepted, and a bad run is entirely possible.</li>
              <li><b>Early-stage software.</b> Contracts, however carefully written and reviewed, carry risk.</li>
            </ul>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            {faqItems.map(([question, answer]) => <Faq question={question} answer={answer} key={question} />)}
          </section>

          <section id="legal" style={{ borderBottom: 0 }}>
            <h2>Legal</h2>
            <p>Daily reward distributions are protocol AMM fees redistributed between NFTs. They are not dividends and confer no equity, ownership or shareholder rights; mechanically the payout is identical to a liquidity provider collecting fees on Uniswap. Holding a Commander is not an investment in anything.</p>
            <p>The enemy, its territory, all hardware, ranks and callsigns in Warroom are fictional. Nothing here depicts real people, places, weapons or military operations.</p>
            <p>Nothing here is financial, investment, legal or tax advice, nor an offer to buy or sell securities. Digital assets carry risk, including the risk of losing everything you put in.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
