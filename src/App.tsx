import { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Crosshair,
  ExternalLink,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  Medal,
  Menu,
  PackagePlus,
  Radar,
  Rocket,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import { formatUnits } from 'viem'
import { CONTRACTS, EXPLORER, EXTRA_SHOT_PRICE, FREE_SHOT_COOLDOWN, MINT_PRICE, MISSILES, RANKS } from './config'
import type { Activity, Commander, Screen } from './types'
import { useWarroom } from './useWarroom'

const nav: Array<{ id: Screen; label: string; icon: typeof Rocket }> = [
  { id: 'battle', label: 'Battle', icon: Crosshair },
  { id: 'arsenal', label: 'Arsenal', icon: Rocket },
  { id: 'rank', label: 'Rank', icon: Medal },
  { id: 'rewards', label: 'Rewards', icon: CircleDollarSign },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
  { id: 'docs', label: 'Protocol', icon: Shield },
]

function compact(value: bigint, decimals = 18) {
  const number = Number(formatUnits(value, decimals))
  return new Intl.NumberFormat('en-US', { notation: number >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: number < 10 ? 4 : 1 }).format(number)
}

function full(value: bigint, decimals = 18) {
  return Number(formatUnits(value, decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
}

function timeLeft(unix: number, tick: number) {
  const seconds = Math.max(0, unix - tick)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function relativeTime(timestamp: number, tick: number) {
  const diff = Math.max(0, tick - timestamp)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function CommanderGlyph({ id, size = 38 }: { id: bigint; size?: number }) {
  const seed = Number(id % 7n)
  return (
    <span className="commander-glyph" style={{ width: size, height: size }} aria-hidden="true">
      <span style={{ transform: `rotate(${seed * 45}deg)` }} />
      <b>{String(id).slice(-2)}</b>
    </span>
  )
}

function App() {
  const { state, selected, actions } = useWarroom()
  const [screen, setScreen] = useState<Screen>('battle')
  const [mobileNav, setMobileNav] = useState(false)
  const [mintOpen, setMintOpen] = useState(false)
  const [mintQty, setMintQty] = useState(1)
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const openMint = () => {
    if (!state.connected) {
      void actions.connect()
      return
    }
    setMintOpen(true)
  }

  useEffect(() => {
    if (state.connected && state.commanders.length === 0) setMintOpen(true)
  }, [state.connected, state.commanders.length])

  const page = (() => {
    switch (screen) {
      case 'battle': return <Battle state={state} selected={selected} tick={tick} onLaunch={actions.launch} onMint={openMint} onNavigate={setScreen} />
      case 'arsenal': return <Arsenal state={state} selected={selected} onUpgrade={actions.upgrade} onMint={openMint} />
      case 'rank': return <RankRoom state={state} selected={selected} onRankUp={actions.rankUp} onMint={openMint} />
      case 'rewards': return <Rewards state={state} selected={selected} tick={tick} onClaim={actions.claim} onClose={actions.closeRound} onLaunch={() => actions.launch(false)} />
      case 'activity': return <ActivityFeed items={state.activity} tick={tick} />
      case 'docs': return <Protocol />
    }
  })()

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={19} /></button>
        <button className="brand" onClick={() => setScreen('battle')}><span className="brand-pip" />WARROOM</button>
        <nav className={mobileNav ? 'nav open' : 'nav'} aria-label="Primary navigation">
          {nav.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => { setScreen(item.id); setMobileNav(false) }}><Icon size={15} />{item.label}</button>
          })}
        </nav>
        <div className="round-mini">
          <span>Round {state.round.id}</span>
          <b>{timeLeft(state.round.endsAt, tick)}</b>
        </div>
        <button className="wallet-button" onClick={() => state.connected ? undefined : void actions.connect()}>
          <span className={state.connected ? 'network-dot online' : 'network-dot'} />
          {state.connected ? <><span>{shortAddress(state.address)}</span><b>{compact(state.warBalance)} WAR</b></> : <><Wallet size={15} /><b>Connect wallet</b></>}
        </button>
      </header>

      {state.demo && (
        <div className="demo-ribbon">
          <span><Sparkles size={14} /> Interactive demo</span>
          <p>All mechanics work locally. Add the deployed game address to switch automatically to Robinhood Chain.</p>
          <button onClick={actions.resetDemo}>Reset demo</button>
        </div>
      )}

      <div className="workspace">
        <aside className="commanders-panel">
          <div className="section-label">Your command</div>
          {state.commanders.length ? state.commanders.map((commander) => (
            <button key={commander.id.toString()} className={selected?.id === commander.id ? 'commander-card selected' : 'commander-card'} onClick={() => actions.select(commander.id)}>
              <CommanderGlyph id={commander.id} />
              <span><b>Commander #{commander.id.toString().padStart(3, '0')}</b><small>{RANKS[commander.rank].name} · LVL {commander.missileLevel}</small></span>
              {commander.activeRound === state.round.id && <i title="Active this round" />}
            </button>
          )) : (
            <div className="empty-command">
              <div className="empty-mark"><Radar size={25} /></div>
              <b>No Commander yet</b>
              <p>Mint the NFT that carries your rank and battle history.</p>
            </div>
          )}
          <button className="add-commander" onClick={openMint}><PackagePlus size={16} /> Mint more</button>
          <div className="chain-card">
            <span><i className="network-dot online" /> Robinhood Chain</span>
            <b>4663</b>
            <a href={`${EXPLORER}/token/${CONTRACTS.pltr}`} target="_blank" rel="noreferrer">Official PLTR <ExternalLink size={12} /></a>
          </div>
        </aside>

        <main className="main-content">{page}</main>
      </div>

      {state.pendingAction && (
        <div className="transaction-toast"><LoaderCircle className="spin" size={18} /><span><b>{state.pendingAction}</b><small>{state.demo ? 'Simulating transaction…' : 'Confirm in wallet and wait for finality…'}</small></span></div>
      )}
      {state.error && (
        <div className="error-toast"><span><b>Action failed</b><small>{state.error}</small></span><button onClick={actions.dismissError}><X size={16} /></button></div>
      )}

      {mintOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMintOpen(false)}>
          <section className="mint-modal" role="dialog" aria-modal="true" aria-labelledby="mint-title">
            <div className="modal-head"><div><span className="section-label">ERC-721 · MAX 1,200</span><h2 id="mint-title">Deploy Commander</h2></div><button onClick={() => setMintOpen(false)} aria-label="Close"><X /></button></div>
            <div className="mint-visual"><CommanderGlyph id={BigInt(state.minted + 1)} size={84} /><div><span>Next assignment</span><b>#{String(state.minted + 1).padStart(3, '0')}</b><small>Recruit · Missile Level 1</small></div></div>
            <div className="quantity-row"><span>Quantity</span><div><button onClick={() => setMintQty(Math.max(1, mintQty - 1))}>−</button><b>{mintQty}</b><button onClick={() => setMintQty(Math.min(25, state.maxSupply - state.minted, mintQty + 1))}>+</button></div></div>
            <div className="burn-ledger">
              <p><span>Total</span><b>{compact(MINT_PRICE * BigInt(mintQty))} WAR</b></p>
              <p className="burn"><span>Burned forever</span><b>{compact(MINT_PRICE * BigInt(mintQty) / 2n)} WAR · 50%</b></p>
              <p><span>Protocol treasury</span><b>{compact(MINT_PRICE * BigInt(mintQty) / 2n)} WAR · 50%</b></p>
            </div>
            <button className="primary-action" disabled={!state.connected || state.warBalance < MINT_PRICE * BigInt(mintQty) || Boolean(state.pendingAction)} onClick={async () => { await actions.mint(mintQty); setMintOpen(false); setMintQty(1) }}>
              {!state.connected ? 'Connect wallet first' : state.warBalance < MINT_PRICE * BigInt(mintQty) ? 'Not enough WAR' : `Mint ${mintQty} Commander${mintQty > 1 ? 's' : ''}`}
              <ArrowUpRight size={18} />
            </button>
            <p className="modal-note">Rank, upgrades and battle progress live on the NFT and move with it when transferred.</p>
          </section>
        </div>
      )}
    </div>
  )
}

type PageProps = {
  state: ReturnType<typeof useWarroom>['state']
  selected?: Commander
}

function PageTitle({ eyebrow, title, copy, aside }: { eyebrow: string; title: string; copy: string; aside?: React.ReactNode }) {
  return <div className="page-title"><div><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{aside}</div>
}

function EmptyGate({ onMint }: { onMint: () => void }) {
  return <div className="empty-gate"><Radar size={40} /><h2>Commander required</h2><p>Mint a Commander to unlock battle actions. The NFT keeps the complete progression record.</p><button className="primary-action" onClick={onMint}>Mint Commander <ArrowUpRight size={17} /></button></div>
}

function Battle({ state, selected, tick, onLaunch, onMint, onNavigate }: PageProps & { tick: number; onLaunch: (paid: boolean) => Promise<void>; onMint: () => void; onNavigate: (screen: Screen) => void }) {
  const [pulse, setPulse] = useState(0)
  const cooldown = selected ? Math.max(0, selected.lastLaunchAt + FREE_SHOT_COOLDOWN - tick) : 0
  const today = Math.floor(tick / 86400)
  const extras = selected?.extraDay === today ? selected.extraCount : 0
  const hp = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const fire = async (paid: boolean) => { setPulse((value) => value + 1); await onLaunch(paid) }

  return <>
    <PageTitle eyebrow="Global operation" title="The common target" copy="Every Commander attacks the same target. At zero integrity, a new cycle begins immediately." aside={<div className="status-chip"><i /> LIVE TARGET · CYCLE {state.targetCycle}</div>} />
    {!selected ? <EmptyGate onMint={onMint} /> : <>
      <section className="battle-grid">
        <div className="target-stage">
          <div className="stage-corners"><span>GRID 42°21'N</span><span>THREAT / ALPHA</span></div>
          <svg viewBox="0 0 860 500" role="img" aria-label={`Common target at ${hp.toFixed(1)} percent integrity`}>
            <defs>
              <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 0H0V38" fill="none" stroke="#283139" strokeWidth="1" /></pattern>
              <radialGradient id="danger"><stop stopColor="#ed4b32" stopOpacity=".25" /><stop offset="1" stopColor="#ed4b32" stopOpacity="0" /></radialGradient>
            </defs>
            <rect width="860" height="500" fill="url(#grid)" opacity=".55" />
            {[90, 150, 215].map((r) => <circle key={r} cx="430" cy="250" r={r} fill="none" stroke="#273038" strokeDasharray="8 10" />)}
            <circle cx="430" cy="250" r="160" fill="url(#danger)" />
            <path d="M430 122l92 48 30 99-59 91-112 13-79-73 15-111z" fill="#301713" stroke="#ed4b32" strokeWidth="2" />
            <path d="M430 165l54 30 18 59-37 54-67 5-42-48 14-61z" fill="none" stroke="#ed4b32" opacity=".75" />
            <circle cx="430" cy="250" r="28" fill="#ed4b32" opacity=".16" stroke="#ff735c" />
            <path d="M402 250h56M430 222v56" stroke="#ff735c" />
            <g className={pulse ? 'rocket-flight' : ''} key={pulse}>
              <path d="M85 420 Q280 60 410 225" fill="none" stroke="#ffb000" strokeWidth="2" strokeDasharray="7 7" />
              <circle cx="85" cy="420" r="5" fill="#42a7ff" />
              <circle className="rocket-dot" cx="85" cy="420" r="5" fill="#ffb000" />
            </g>
            {[[105,105],[740,100],[745,405],[130,400]].map(([x,y], i) => <g key={i}><circle cx={x} cy={y} r="8" fill="#102638" stroke="#42a7ff" /><circle cx={x} cy={y} r="2" fill="#42a7ff" /></g>)}
            <text x="430" y="99" textAnchor="middle" fill="#ed4b32" fontSize="12" letterSpacing="3">GLOBAL TARGET</text>
          </svg>
          <div className="integrity-panel"><div><span>Enemy integrity</span><b>{hp.toFixed(1)}%</b></div><div className="integrity-track"><i style={{ width: `${hp}%` }} /></div><small>{state.targetHp.toLocaleString()} / {state.targetMaxHp.toLocaleString()} HP</small></div>
        </div>

        <div className="battle-controls">
          <div className="selected-commander"><CommanderGlyph id={selected.id} size={48} /><div><span>Active unit</span><b>Commander #{selected.id.toString().padStart(3, '0')}</b><small>{RANKS[selected.rank].name} · Missile LVL {selected.missileLevel}</small></div></div>
          <div className="weapon-readout"><div><span>Damage / hit</span><b>{MISSILES[selected.missileLevel - 1].damage.toLocaleString()}</b></div><div><span>Accuracy</span><b>70%</b></div><div><span>Round status</span><b className={selected.activeRound === state.round.id ? 'blue' : 'red'}>{selected.activeRound === state.round.id ? 'Active' : 'Standby'}</b></div></div>
          <button className="launch-button" disabled={cooldown > 0 || Boolean(state.pendingAction)} onClick={() => void fire(false)}><Rocket size={23} /><span>{cooldown ? 'Reloading' : 'Launch rocket'}<small>{cooldown ? timeLeft(selected.lastLaunchAt + FREE_SHOT_COOLDOWN, tick) : 'Free launch ready'}</small></span></button>
          <button className="extra-button" disabled={extras >= 3 || state.warBalance < EXTRA_SHOT_PRICE || Boolean(state.pendingAction)} onClick={() => void fire(true)}><Zap size={19} /><span>Extra launch<small>10,000 WAR · 50% burns</small></span><b>{3 - extras}/3</b></button>
          <p className="control-note"><LockKeyhole size={14} /> Every signed launch is recorded on-chain and appears in Activity.</p>
        </div>
      </section>

      <section className="metric-strip">
        <div><span>Your hits</span><b>{selected.hits.toLocaleString()}</b><small>{selected.launches} total launches</small></div>
        <div><span>Your damage</span><b>{selected.totalDamage.toLocaleString()}</b><small>Commander #{selected.id.toString()}</small></div>
        <div><span>WAR burned</span><b>{compact(selected.warBurned)}</b><small>by this NFT</small></div>
        <div><span>Reward weight</span><b>{Number(RANKS[selected.rank].multiplier) / 100}×</b><small>{RANKS[selected.rank].name}</small></div>
        <button onClick={() => onNavigate('activity')}>Open Activity <ArrowUpRight size={16} /></button>
      </section>
    </>}
  </>
}

function Arsenal({ state, selected, onUpgrade, onMint }: PageProps & { onUpgrade: () => Promise<void>; onMint: () => void }) {
  return <>
    <PageTitle eyebrow="Missile systems" title="Arsenal" copy="Hits unlock stronger missiles. Every upgrade spends WAR: 50% is burned and 50% goes to the protocol treasury." />
    {!selected ? <EmptyGate onMint={onMint} /> : <div className="card-grid">
      {MISSILES.map((missile) => {
        const current = selected.missileLevel === missile.level
        const complete = selected.missileLevel > missile.level
        const next = selected.missileLevel + 1 === missile.level
        const can = next && selected.hits >= missile.hits && state.warBalance >= missile.cost
        return <section className={`upgrade-card ${current ? 'current' : ''} ${complete ? 'complete' : ''}`} key={missile.level}>
          <div className="upgrade-card-head"><span>LEVEL {String(missile.level).padStart(2, '0')}</span>{current ? <b>CURRENT</b> : complete ? <b><Check size={13} /> COMPLETE</b> : <LockKeyhole size={16} />}</div>
          <div className="missile-mark"><Rocket size={38 + missile.level * 4} strokeWidth={1.4} /></div>
          <h2>{['Field Rocket', 'Cruise Lance', 'Siege Breaker', 'Atlas Strike'][missile.level - 1]}</h2>
          <div className="spec-grid"><p><span>Damage</span><b>{missile.damage.toLocaleString()}</b></p><p><span>Required hits</span><b>{missile.hits || 'Issued'}</b></p></div>
          <div className="burn-ledger compact"><p><span>Upgrade price</span><b>{missile.cost ? `${compact(missile.cost)} WAR` : 'Included'}</b></p>{missile.cost > 0n && <p className="burn"><span>Burned</span><b>{compact(missile.cost / 2n)} WAR</b></p>}</div>
          {current ? <button className="card-action" disabled>Equipped</button> : complete ? <button className="card-action" disabled>Completed</button> : <button className="card-action" disabled={!can || Boolean(state.pendingAction)} onClick={() => void onUpgrade()}>{!next ? 'Upgrade in order' : selected.hits < missile.hits ? `${missile.hits - selected.hits} more hits` : state.warBalance < missile.cost ? 'Not enough WAR' : 'Upgrade missile'}<ArrowUpRight size={16} /></button>}
        </section>
      })}
    </div>}
  </>
}

function RankRoom({ state, selected, onRankUp, onMint }: PageProps & { onRankUp: (purchased: boolean) => Promise<void>; onMint: () => void }) {
  const [mode, setMode] = useState<'earn' | 'buy'>('buy')
  const nextRank = selected && selected.rank < 4 ? RANKS[selected.rank + 1] : undefined
  const ageDays = selected ? Math.floor((Date.now() / 1000 - selected.mintedAt) / 86400) : 0
  const progressReady = Boolean(selected && nextRank && selected.hits >= nextRank.hits && ageDays >= nextRank.days)

  return <>
    <PageTitle eyebrow="Command hierarchy" title="Rank" copy="Rank controls your share of PLTR rewards. Captain through Colonel can be purchased; General is reached only through the trial." aside={selected && <div className="rank-badge"><Medal size={20} /><span>Current rank<b>{RANKS[selected.rank].name}</b></span></div>} />
    {!selected ? <EmptyGate onMint={onMint} /> : <>
      <section className="rank-ladder">
        {RANKS.map((rank, index) => <div key={rank.name} className={`rank-rung ${index === selected.rank ? 'current' : ''} ${index < selected.rank ? 'complete' : ''}`}>
          <span className="rank-index">0{index + 1}</span>
          <div><b>{rank.name}</b><small>{index === 4 ? 'Trial only' : index === 0 ? 'Entry rank' : `${rank.hits} hits · ${rank.days} day${rank.days > 1 ? 's' : ''}`}</small></div>
          <p><span>Seats</span><b>{rank.seats || '∞'}</b></p>
          <p><span>Reward weight</span><b>{Number(rank.multiplier) / 100}×</b></p>
          <span className="rung-state">{index < selected.rank ? <Check /> : index === selected.rank ? 'YOU' : <LockKeyhole />}</span>
        </div>)}
      </section>

      {nextRank && <section className="promotion-panel">
        <div className="promotion-copy"><span className="section-label">Next promotion</span><h2>{RANKS[selected.rank].name} <ArrowUpRight size={21} /> {nextRank.name}</h2><p>{selected.rank === 3 ? 'General cannot be purchased. A Colonel must enter the protocol trial while one of ten seats is available.' : 'Choose the earned route after meeting the battle requirements, or skip them by purchasing the rank.'}</p></div>
        {selected.rank < 3 && <div className="mode-switch"><button className={mode === 'buy' ? 'active' : ''} onClick={() => setMode('buy')}>Buy rank</button><button className={mode === 'earn' ? 'active' : ''} onClick={() => setMode('earn')}>Earned route</button></div>}
        <div className="promotion-cost">
          <p><span>{selected.rank === 3 ? 'Trial deposit' : mode === 'buy' ? 'Fast promotion' : 'Promotion fee'}</span><b>{compact(selected.rank === 3 ? 800_000n * 10n ** 18n : mode === 'buy' ? nextRank.buy : nextRank.earned)} WAR</b></p>
          <p className="burn"><span>Burned forever</span><b>50%</b></p>
          {mode === 'earn' && selected.rank < 3 && <div className="requirements"><span className={selected.hits >= nextRank.hits ? 'met' : ''}><Check size={13} /> {selected.hits}/{nextRank.hits} hits</span><span className={ageDays >= nextRank.days ? 'met' : ''}><Check size={13} /> {ageDays}/{nextRank.days} days</span></div>}
          <button className="primary-action" disabled={(mode === 'earn' && selected.rank < 3 && !progressReady) || Boolean(state.pendingAction)} onClick={() => void onRankUp(mode === 'buy')}>
            {selected.rank === 3 ? 'Enter General trial' : mode === 'buy' ? `Buy ${nextRank.name}` : progressReady ? `Claim ${nextRank.name}` : 'Requirements not met'}<ArrowUpRight size={17} />
          </button>
        </div>
      </section>}
    </>}
  </>
}

function Rewards({ state, selected, tick, onClaim, onClose, onLaunch }: PageProps & { tick: number; onClaim: () => Promise<void>; onClose: () => Promise<void>; onLaunch: () => Promise<void> }) {
  const active = selected?.activeRound === state.round.id
  const pool = state.creatorFees
  const fee = pool * 5n / 1000n
  return <>
    <PageTitle eyebrow="Pons creator fees" title="Rewards in PLTR" copy="Creator Fees from the WAR/PLTR Pons V2 market are claimed into the game contract and distributed every five hours by rank weight." aside={<div className={`status-chip ${active ? '' : 'warning'}`}><i /> {active ? 'IN ROUND SNAPSHOT' : 'NOT ACTIVE THIS ROUND'}</div>} />
    <section className="reward-hero">
      <div className="pltr-orb"><span>PLTR</span><b>R</b></div>
      <div className="reward-total"><span>Available Creator Fees</span><b>{full(pool)} <small>PLTR</small></b><p>Read from Pons V2 Fee Escrow. Values are never typed into the production interface.</p></div>
      <div className="round-clock"><span>Round {state.round.id} closes in</span><b>{timeLeft(state.round.endsAt, tick)}</b><small>Any wallet can close it for a 0.5% fee.</small></div>
    </section>

    <div className="reward-grid">
      <section className="panel-card">
        <div className="panel-card-head"><div><span className="section-label">Distribution preview</span><h2>Current round</h2></div><Gauge size={24} /></div>
        <div className="flow-list">
          <div><span>01</span><p><b>Pons Creator Fees</b><small>WAR market accrues quote-asset fees in PLTR.</small></p><strong>{full(pool)} PLTR</strong></div>
          <div><span>02</span><p><b>Keeper incentive</b><small>Paid to the wallet that closes the round.</small></p><strong>−{full(fee)} PLTR</strong></div>
          <div><span>03</span><p><b>Commander pool</b><small>Split by the frozen weight of active NFTs.</small></p><strong>{full(pool - fee)} PLTR</strong></div>
        </div>
        {tick >= state.round.endsAt ? <button className="primary-action" disabled={Boolean(state.pendingAction)} onClick={() => void onClose()}>Close round · earn 0.5% <ArrowUpRight size={17} /></button> : !active ? <button className="primary-action secondary" disabled={!selected || Boolean(state.pendingAction)} onClick={() => void onLaunch()}>Launch once to enter <Rocket size={17} /></button> : <div className="round-ready"><Check size={17} /> Your weight is locked for round {state.round.id}</div>}
      </section>

      <section className="panel-card claim-card">
        <div className="panel-card-head"><div><span className="section-label">Commander account</span><h2>Claimable balance</h2></div><Trophy size={24} /></div>
        <b className="claim-value">{full(state.claimable)} <small>PLTR</small></b>
        <p>Settled rewards remain claimable until withdrawn. The current NFT owner can claim its credits.</p>
        <div className="claim-details"><span>Rank weight <b>{selected ? Number(RANKS[selected.rank].multiplier) / 100 : 0}×</b></span><span>Wallet balance <b>{full(state.pltrBalance)} PLTR</b></span></div>
        <button className="primary-action" disabled={!state.claimable || Boolean(state.pendingAction)} onClick={() => void onClaim()}>Claim PLTR <ArrowUpRight size={17} /></button>
      </section>
    </div>

    <section className="source-strip"><Shield size={20} /><div><b>Verifiable source of rewards</b><p>Pons V2 Fee Escrow → WARROOM contract → 5-hour weighted round → Commander claim.</p></div><a href={`${EXPLORER}/address/${CONTRACTS.ponsFeeEscrow}`} target="_blank" rel="noreferrer">Open Fee Escrow <ExternalLink size={14} /></a></section>
  </>
}

function ActivityFeed({ items, tick }: { items: Activity[]; tick: number }) {
  const icons = { launch: Rocket, mint: PackagePlus, rank: Medal, upgrade: Gauge, extra: Zap, reward: CircleDollarSign, round: Trophy }
  return <>
    <PageTitle eyebrow="On-chain event log" title="Activity" copy="Mint, launch, rank and extra-shot events are decoded from the WARROOM contract. Recent public-RPC history is shown here." aside={<div className="status-chip"><i /> AUTO REFRESH</div>} />
    <section className="activity-panel">
      <div className="activity-head"><span>Event</span><span>Details</span><span>Time</span><span>Transaction</span></div>
      {items.length ? items.map((item) => {
        const Icon = icons[item.kind]
        return <div className={`activity-row ${item.mine ? 'mine' : ''}`} key={item.id}>
          <div className={`activity-icon ${item.kind}`}><Icon size={18} /></div>
          <div><b>{item.title}</b><small>{item.detail}</small></div>
          <time>{relativeTime(item.timestamp, tick)}</time>
          {item.txHash ? <a href={`${EXPLORER}/tx/${item.txHash}`} target="_blank" rel="noreferrer">{shortAddress(item.txHash)} <ExternalLink size={12} /></a> : <span className="demo-tx">DEMO EVENT</span>}
        </div>
      }) : <div className="activity-empty">No contract events found in the recent RPC window.</div>}
    </section>
  </>
}

function Protocol() {
  return <>
    <PageTitle eyebrow="How it works" title="Protocol" copy="The short version for players, followed by the exact flow used by the contracts." />
    <section className="explain-grid">
      {[
        ['01', 'Get a Commander', 'The NFT costs 100,000 WAR. Half burns forever; half goes to the protocol treasury. Progress belongs to the NFT and follows it to a new owner.'],
        ['02', 'Attack together', 'Everyone fires at one shared target. A free shot reloads every four hours; up to three extra shots per day cost 10,000 WAR each.'],
        ['03', 'Grow your rank', 'Five ranks set reward weight. Captain through Colonel can be bought with WAR. General is trial-only and limited to ten seats.'],
        ['04', 'Earn tokenized PLTR', 'Every five hours, Pons Creator Fees are split between active Commanders. Any wallet can close the round and earns 0.5%.'],
      ].map(([number, title, text]) => <article key={number}><span>{number}</span><h2>{title}</h2><p>{text}</p></article>)}
    </section>
    <section className="architecture-panel">
      <div><span className="section-label">Money flow</span><h2>One rule for every WAR spend</h2><p>Minting, missile upgrades, rank purchases and extra shots all call the same internal payment function. There is no alternate path that can skip the burn.</p></div>
      <div className="split-diagram"><span><b>PLAYER</b><small>signed WAR spend</small></span><i /><span className="burn-node"><b>50%</b><small>0x…dEaD</small></span><i /><span><b>50%</b><small>treasury wallet</small></span></div>
    </section>
    <section className="contract-list">
      <div><span>Network</span><b>Robinhood Chain · 4663</b><a href="https://docs.robinhood.com/chain/connecting/" target="_blank" rel="noreferrer">Official docs <ExternalLink size={12} /></a></div>
      <div><span>Reward asset</span><b>PLTR · Robinhood Token</b><a href={`${EXPLORER}/token/${CONTRACTS.pltr}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.pltr)} <ExternalLink size={12} /></a></div>
      <div><span>Pons V2 Fee Escrow</span><b>Creator Fees source</b><a href={`${EXPLORER}/address/${CONTRACTS.ponsFeeEscrow}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.ponsFeeEscrow)} <ExternalLink size={12} /></a></div>
      <div><span>WARROOM Game</span><b>{CONTRACTS.game === '0x0000000000000000000000000000000000000000' ? 'Ready for deployment' : 'Deployed'}</b><span>{shortAddress(CONTRACTS.game)}</span></div>
    </section>
    <p className="legal-note">PLTR here means the Palantir Technologies Robinhood Token. It provides economic exposure and is not a share or shareholder right. Availability and transfers may be restricted by jurisdiction. Rewards are protocol fee redistribution, not dividends or investment advice.</p>
  </>
}

export default App
