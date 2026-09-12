import { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon,
  ArrowRight,
  Check,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Medal,
  Menu,
  PackagePlus,
  Radar,
  Rocket,
  Shield,
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

type View = Screen | 'landing'

const navigation: Array<{ id: Screen; label: string }> = [
  { id: 'battle', label: 'Play' },
  { id: 'arsenal', label: 'Upgrade' },
  { id: 'rank', label: 'Rank' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'activity', label: 'Activity' },
  { id: 'docs', label: 'Docs' },
]

const missileNames = ['Field Rocket', 'Cruise Lance', 'Siege Breaker', 'Atlas Strike']

function token(value: bigint, decimals = 18, maximumFractionDigits = 4) {
  return Number(formatUnits(value, decimals)).toLocaleString('en-US', { maximumFractionDigits })
}

function shortToken(value: bigint) {
  const number = Number(formatUnits(value, 18))
  return new Intl.NumberFormat('en-US', {
    notation: number >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: number < 10 ? 4 : 1,
  }).format(number)
}

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
}

function countdown(unix: number, tick: number) {
  const seconds = Math.max(0, unix - tick)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function relativeTime(timestamp: number, tick: number) {
  const diff = Math.max(0, tick - timestamp)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

function CommanderGlyph({ id, size = 24 }: { id: bigint; size?: number }) {
  const seed = Number(id % 5n)
  const cells = Array.from({ length: 16 }, (_, index) => {
    const x = index % 4
    const y = Math.floor(index / 4)
    const active = ((index * 7 + seed * 3) % 5) < 2
    return active ? <rect key={index} x={x * 4 + .6} y={y * 4 + .6} width="2.8" height="2.8" /> : null
  })
  return <svg className="cmd-avatar" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">{cells}</svg>
}

function Brand({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button className={`brand ${compact ? 'landbrand' : ''}`} onClick={onClick} title="Back to the front page">
      <img src="/warroom-logo.jpg" alt="" />
      <span className="dot" />
      <b>WARROOM</b>
    </button>
  )
}

export default function App() {
  const { state, selected, actions } = useWarroom()
  const [screen, setScreen] = useState<View>(() => {
    const hash = window.location.hash.slice(1) as View
    return ['landing', ...navigation.map((item) => item.id)].includes(hash) ? hash : 'landing'
  })
  const [mobileNav, setMobileNav] = useState(false)
  const [mintOpen, setMintOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [mintQty, setMintQty] = useState(1)
  const [connectIntent, setConnectIntent] = useState(false)
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onHistory = () => {
      const hash = window.location.hash.slice(1) as View
      if (['landing', ...navigation.map((item) => item.id)].includes(hash)) setScreen(hash)
    }
    window.addEventListener('popstate', onHistory)
    return () => window.removeEventListener('popstate', onHistory)
  }, [])

  useEffect(() => {
    const context = document.modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const register = (tool: Parameters<typeof context.registerTool>[0]) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal }))
    void Promise.all([
      register({
        name: 'get_warroom_status',
        title: 'Get WARROOM status',
        description: 'Read the current target, reward round, wallet and selected Commander state without changing anything.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({
          connected: state.connected,
          selectedCommander: selected?.id.toString() ?? null,
          targetCycle: state.targetCycle,
          targetHp: state.targetHp.toString(),
          round: state.round.id,
          roundEndsAt: state.round.endsAt,
          creatorFeesPltr: token(state.creatorFees),
          claimablePltr: token(state.claimable),
        }),
      }),
      register({
        name: 'select_warroom_commander',
        title: 'Select Commander',
        description: 'Select one Commander NFT already held by the connected wallet.',
        inputSchema: { type: 'object', properties: { tokenId: { type: 'string', pattern: '^[0-9]+$' } }, required: ['tokenId'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          const tokenId = BigInt((input as { tokenId?: string }).tokenId || '')
          if (!state.commanders.some((commander) => commander.id === tokenId)) throw new Error('This wallet does not hold that Commander.')
          actions.select(tokenId)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          return { selectedCommander: tokenId.toString() }
        },
      }),
      register({
        name: 'launch_warroom_rocket',
        title: 'Launch rocket',
        description: 'Launch a free rocket or spend 10,000 WAR for an extra launch with the selected Commander. This may request a wallet transaction.',
        inputSchema: { type: 'object', properties: { paid: { type: 'boolean', description: 'True for an extra 10,000 WAR launch; false for the cooldown-based free launch.' } }, required: ['paid'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          if (!state.connected || !selected) throw new Error('Connect a wallet and select a Commander first.')
          const paid = Boolean((input as { paid?: boolean }).paid)
          await actions.launch(paid)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          return { submitted: true, commanderId: selected.id.toString(), paid }
        },
      }),
      register({
        name: 'mint_warroom_commanders',
        title: 'Mint Commanders',
        description: 'Mint one to 25 Commander NFTs at 100,000 WAR each. This may request token approval and a wallet transaction.',
        inputSchema: { type: 'object', properties: { quantity: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['quantity'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          const quantity = Number((input as { quantity?: number }).quantity)
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 25) throw new Error('Quantity must be an integer from 1 to 25.')
          if (!state.connected) throw new Error('Connect a wallet first.')
          if (state.minted + quantity > state.maxSupply) throw new Error('Not enough Commanders remain.')
          await actions.mint(quantity)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          return { submitted: true, quantity }
        },
      }),
    ]).catch((error) => {
      if (!lifecycle.signal.aborted) console.warn('WebMCP registration failed', error)
    })
    return () => lifecycle.abort()
  }, [actions, selected, state])

  useEffect(() => {
    if (!connectIntent || !state.connected) return
    setConnectIntent(false)
    if (state.commanders.length) setScreen('battle')
    else setMintOpen(true)
  }, [connectIntent, state.connected, state.commanders.length])

  const enter = () => {
    if (!state.connected) {
      setConnectIntent(true)
      void actions.connect()
      return
    }
    if (!state.commanders.length) setMintOpen(true)
    else setScreen('battle')
  }

  const openMint = () => {
    if (!state.connected) {
      setConnectIntent(true)
      void actions.connect()
      return
    }
    setMintQty(1)
    setMintOpen(true)
  }

  const go = (next: View) => {
    setScreen(next)
    window.history.pushState(null, '', next === 'landing' ? window.location.pathname : `#${next}`)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const page = (() => {
    if (screen === 'landing') return null
    switch (screen) {
      case 'battle': return <PlayPage state={state} selected={selected} tick={tick} onLaunch={actions.launch} onMint={openMint} onRoster={() => setRosterOpen(true)} />
      case 'arsenal': return <UpgradePage state={state} selected={selected} onUpgrade={actions.upgrade} onMint={openMint} />
      case 'rank': return <RankPage state={state} selected={selected} onRankUp={actions.rankUp} onMint={openMint} />
      case 'rewards': return <RewardsPage state={state} selected={selected} tick={tick} onClaim={actions.claim} onClaimAll={actions.claimAll} onClose={actions.closeRound} onLaunch={() => actions.launch(false)} onMint={openMint} />
      case 'activity': return <ActivityPage items={state.activity} tick={tick} />
      case 'docs': return <DocsPage />
    }
  })()

  return (
    <div id="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {screen === 'landing' ? (
        <Landing state={state} selected={selected} tick={tick} onEnter={enter} onDocs={() => go('docs')} onRoster={() => setRosterOpen(true)} onMint={openMint} />
      ) : (
        <>
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Toggle navigation"><Menu size={18} /></button>
            <Brand onClick={() => go('landing')} />
            <nav className={`nav ${mobileNav ? 'open' : ''}`} aria-label="Primary navigation">
              {navigation.map((item) => <button key={item.id} className={screen === item.id ? 'on' : ''} onClick={() => go(item.id)}>{item.label}</button>)}
            </nav>
            <div className="topright">
              <div className="season-clock"><div className="eyebrow">Round #{state.round.id} closes</div><div className="t">{countdown(state.round.endsAt, tick)}</div></div>
              <button className="wallet" onClick={() => state.connected ? setRosterOpen(true) : enter()}>
                {selected ? <CommanderGlyph id={selected.id} size={16} /> : <Wallet size={15} />}
                <span>{selected ? `#${selected.id}` : state.connected ? shortAddress(state.address) : 'Connect'}</span>
                {selected && <span className="dim">{RANKS[selected.rank].name}</span>}
                <span className="dim">·</span><span className="amb num">{shortToken(state.warBalance)} WAR</span>
              </button>
              <button className="hbtn" onClick={openMint}>+ Commander</button>
            </div>
          </header>
          {state.demo && <div className="classbar"><span>Interactive demo · Robinhood Chain 4663</span><button onClick={actions.resetDemo}>Reset local state</button></div>}
          <main id="main-content">{page}</main>
        </>
      )}

      {state.pendingAction && <div className="transaction-toast" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} /><span><b>{state.pendingAction}</b><small>{state.demo ? 'Simulating transaction…' : 'Confirm in wallet and wait for finality…'}</small></span></div>}
      {state.error && <div className="error-toast" role="alert"><span><b>Action failed</b><small>{state.error}</small></span><button onClick={actions.dismissError} aria-label="Dismiss error"><X size={16} /></button></div>}

      {mintOpen && <MintModal state={state} quantity={mintQty} setQuantity={setMintQty} onClose={() => setMintOpen(false)} onMint={async () => {
        try {
          await actions.mint(mintQty)
          setMintOpen(false)
          setMintQty(1)
          setScreen('battle')
        } catch {
          // The transaction error is surfaced by the shared toast.
        }
      }} />}

      {rosterOpen && <RosterModal state={state} selected={selected} onClose={() => setRosterOpen(false)} onSelect={(id) => { actions.select(id); setRosterOpen(false) }} onMint={() => { setRosterOpen(false); openMint() }} />}
    </div>
  )
}

type State = ReturnType<typeof useWarroom>['state']

function Landing({ state, selected, tick, onEnter, onDocs, onRoster, onMint }: { state: State; selected?: Commander; tick: number; onEnter: () => void; onDocs: () => void; onRoster: () => void; onMint: () => void }) {
  const ticker = [
    ['Active commanders', state.round.totalWeight.toLocaleString()],
    ['Launches', state.totalLaunches.toLocaleString()],
    ['WAR burned', shortToken(state.totalBurned)],
    ['Creator Fees', `${token(state.creatorFees)} PLTR`],
    ['General seats', `${state.rankPopulation[4] || 0} / 10`],
    ['Commanders minted', `${state.minted.toLocaleString()} / ${state.maxSupply.toLocaleString()}`],
  ]
  return <>
    <div className="classbar"><span>Warroom · Robinhood Chain · chain 4663 · rewards in tokenized PLTR</span><span>{state.demo ? 'Interactive demo build' : `Round #${state.round.id} · ${countdown(state.round.endsAt, tick)}`}</span></div>
    <div className="landhead">
      <Brand compact onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <div className="land-actions">
        {selected && <button className="wallet" onClick={onRoster}><CommanderGlyph id={selected.id} size={16} /><span>#{selected.id}</span><span className="dim">{RANKS[selected.rank].name}</span><span className="amb num">{shortToken(state.warBalance)} WAR</span></button>}
        <button className="hbtn" onClick={onDocs}>Docs</button>
        {state.connected && <button className="hbtn" onClick={onMint}>+ Commander</button>}
      </div>
    </div>
    <main id="main-content">
      <section className="hero">
        <div className="hero-in">
          <div className="eyebrow">Strategic operations interface</div>
          <h1>WAR<span>ROOM</span></h1>
          <p className="sub">Spend WAR to play. Earn PLTR as rewards.</p>
          <p className="hero-copy">One target, twelve hundred Commanders and ten General seats. Every upgrade burns WAR; every five-hour round distributes Creator Fees in tokenized PLTR.</p>
          <div className="cta">
            <button className="btn btn-lg btn-amber" onClick={onEnter}>{selected ? 'Enter Warroom' : state.connected ? 'Mint a Commander' : 'Connect wallet'}</button>
            <button className="btn btn-lg" onClick={onDocs}>Read the docs</button>
            <span className="eyebrow">Robinhood Chain · injected EVM wallets · 50% of every WAR spend burns</span>
          </div>
        </div>
      </section>
      <div className="marquee"><div>{[...ticker, ...ticker].map(([key, value], index) => <span key={`${key}-${index}`}>{key} <b>{value}</b><i>·</i></span>)}</div></div>
      <div className="page landing-page">
        <EnemyPanel state={state} />
        <div className="warlayout landing-board">
          <BattlePlot pulse={0} integrity={Number(state.targetHp * 10_000n / state.targetMaxHp) / 100} />
          <Feed items={state.activity} tick={tick} />
        </div>
        <div className="stepline">
          {[
            ['Step 1', 'Mint a Commander', '100,000 WAR, half burned. Progress lives on the NFT.'],
            ['Step 2', 'Launch', 'One free launch every four hours at the shared target.'],
            ['Step 3', 'Upgrade and rank up', 'Earn a rank with hits, or buy through Colonel with WAR.'],
            ['Step 4', 'Collect PLTR', 'Creator Fees settle every five hours and remain claimable.'],
          ].map(([number, title, copy]) => <div className="st" key={number}><div className="n">{number}</div><div className="t">{title}</div><p>{copy}</p></div>)}
        </div>
        <div className="statgrid">
          {ticker.slice(0, 6).map(([key, value]) => <div className="stat" key={key}><div className="k">{key}</div><div className="v num">{value}</div></div>)}
        </div>
        <ProtocolContracts />
        <div className="notice legal">Reward distributions are protocol AMM fees redistributed between Commander NFTs and settled in tokenized PLTR. They are not dividends and confer no equity or shareholder rights. Nothing here is financial, investment, legal or tax advice.</div>
      </div>
    </main>
  </>
}

function EnemyPanel({ state }: { state: State }) {
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  return <section className="resil" aria-label={`Enemy integrity ${integrity.toFixed(1)} percent`}>
    <div className="side"><div className="lbl"><b className="fed">COMMAND NETWORK</b><span>{state.round.totalWeight.toLocaleString()} WEIGHT ONLINE</span></div><div className="rtrack"><i className="rfill f" style={{ width: `${Math.max(8, 100 - integrity)}%` }} /></div></div>
    <div className="mid"><span className="v">CYCLE</span><span className="k">#{state.targetCycle}</span></div>
    <div className="side r"><div className="lbl"><b className="rep">GLOBAL TARGET</b><span>{state.targetHp.toLocaleString()} HP</span></div><div className="rtrack"><i className="rfill r" style={{ width: `${integrity}%` }} /></div></div>
  </section>
}

function BattlePlot({ pulse, integrity }: { pulse: number; integrity: number }) {
  return <div className="plotwrap">
    <svg id="plot" viewBox="0 0 980 520" role="img" aria-label={`Live target map. Enemy integrity ${integrity.toFixed(1)} percent.`}>
      <defs>
        <pattern id="war-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#273038" strokeWidth="1" /></pattern>
        <radialGradient id="target-glow"><stop stopColor="#F04A2E" stopOpacity=".24" /><stop offset="1" stopColor="#F04A2E" stopOpacity="0" /></radialGradient>
        <filter id="soft-glow"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <rect width="980" height="520" fill="#0E1216" />
      <rect width="980" height="520" fill="url(#war-grid)" opacity=".58" />
      {[90, 155, 225].map((radius) => <circle key={radius} cx="548" cy="258" r={radius} fill="none" stroke="#333B42" strokeDasharray="8 10" />)}
      <path d="M548 97l117 63 30 116-72 100-137 8-91-91 24-132z" fill="#27120f" stroke="#F04A2E" strokeWidth="2" />
      <circle cx="548" cy="258" r="176" fill="url(#target-glow)" />
      <circle className="target-pulse" cx="548" cy="258" r="29" fill="none" stroke="#F04A2E" />
      <path d="M510 258h76M548 220v76" stroke="#ff856f" />
      <text x="548" y="72" textAnchor="middle" fill="#F04A2E" fontSize="12" letterSpacing="4">GLOBAL TARGET</text>
      {[[120,100],[180,420],[820,112],[855,405],[322,315]].map(([x, y], index) => <g className={`unit-dot unit-${index}`} key={index}><circle cx={x} cy={y} r="8" fill="#0A2E4E" stroke="#2E9BFF" /><circle cx={x} cy={y} r="2" fill="#9ed2ff" /></g>)}
      <g className="ambient-flight"><path d="M180 420Q320 70 520 235" fill="none" stroke="#2E9BFF" strokeWidth="1.5" strokeDasharray="6 8" /><circle cx="180" cy="420" r="4" fill="#2E9BFF" /></g>
      {pulse > 0 && <g className="rocket-flight" key={pulse}><path d="M120 430Q330 40 535 240" fill="none" stroke="#FFB020" strokeWidth="2" strokeDasharray="7 7" /><circle className="rocket-dot" cx="120" cy="430" r="6" fill="#FFB020" /><circle className="impact-ring" cx="548" cy="258" r="18" fill="none" stroke="#FFB020" /></g>}
    </svg>
    <div className="plot-ov" />
    <span className="plot-corner pc-tl">LIVE PLOT · FICTIONAL TARGET</span>
    <span className="plot-corner pc-bl">ROBINHOOD CHAIN · BLOCK FINALITY</span>
    <div className="plot-legend"><span><i className="legend-you" />YOU</span><span><i className="legend-allies" />OTHERS</span><span><i className="legend-target" />ENEMY</span></div>
  </div>
}

function Feed({ items, tick }: { items: Activity[]; tick: number }) {
  return <section className="panel feed-panel"><div className="panel-h"><h3>Activity</h3><span className="eyebrow">Live</span></div><div className="feed">{items.slice(0, 14).map((item) => <div className={`fitem ${item.mine ? 'me' : ''}`} key={item.id}><span className="ts">{relativeTime(item.timestamp, tick)}</span><div className="bd"><b>{item.title}</b><span>{item.detail}</span></div></div>)}</div></section>
}

function EmptyGate({ onMint }: { onMint: () => void }) {
  return <section className="panel empty-gate"><Radar size={40} /><h2>Commander required</h2><p>Mint the NFT that carries your rank, launcher level and battle history.</p><button className="btn btn-lg btn-amber" onClick={onMint}>Mint Commander</button></section>
}

function PlayPage({ state, selected, tick, onLaunch, onMint, onRoster }: { state: State; selected?: Commander; tick: number; onLaunch: (paid: boolean) => Promise<void>; onMint: () => void; onRoster: () => void }) {
  const [pulse, setPulse] = useState(0)
  if (!selected) return <div className="page"><EnemyPanel state={state} /><EmptyGate onMint={onMint} /></div>
  const missile = MISSILES[selected.missileLevel - 1]
  const rank = RANKS[selected.rank]
  const next = selected.rank < 4 ? RANKS[selected.rank + 1] : undefined
  const cooldown = Math.max(0, selected.lastLaunchAt + FREE_SHOT_COOLDOWN - tick)
  const today = Math.floor(tick / 86_400)
  const extras = selected.extraDay === today ? selected.extraCount : 0
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const fire = async (paid: boolean) => { setPulse((value) => value + 1); await onLaunch(paid) }
  const projected = selected.activeRound === state.round.id && state.round.totalWeight > 0n
    ? state.creatorFees * 9_950n / 10_000n * rank.multiplier / state.round.totalWeight
    : 0n
  return <div className="page">
    <EnemyPanel state={state} />
    <div className="warlayout">
      <div>
        <BattlePlot pulse={pulse} integrity={integrity} />
        <div className="bigfire">
          <button className="launch" disabled={cooldown > 0 || Boolean(state.pendingAction)} onClick={() => void fire(false)}>{cooldown ? 'Reloading' : 'Launch'}<span className="cd">{cooldown ? `next launch in ${countdown(selected.lastLaunchAt + FREE_SHOT_COOLDOWN, tick)}` : `Level ${missile.level} · ${missile.damage.toLocaleString()} damage · 70% hit`}</span></button>
          <button className="btn btn-amber paid-launch" disabled={extras >= 3 || state.warBalance < EXTRA_SHOT_PRICE || Boolean(state.pendingAction)} onClick={() => void fire(true)}>Launch now<span>10,000 WAR · {3 - extras} left today</span></button>
        </div>
        <div className="hero-row">
          <div className="cell"><div className="k">Your missile</div><div className="v">Level {missile.level}</div><div className="s">{missile.damage.toLocaleString()} damage per hit</div></div>
          <div className="cell"><div className="k">Commander #{selected.id}</div><div className="v">{rank.name}</div><div className="s">{next ? `${selected.hits} / ${next.hits} hits to ${next.name}` : 'top rank'}</div></div>
          <div className="cell"><div className="k">This round</div><div className="v num">{token(projected)} PLTR</div><div className="s">{selected.activeRound === state.round.id ? `round #${state.round.id} closes in ` : 'launch once to enter · '}{countdown(state.round.endsAt, tick)}</div></div>
          <div className="cell"><div className="k">Your damage</div><div className="v num">{selected.totalDamage.toLocaleString()}</div><div className="s">{selected.hits} hits of {selected.launches} launches</div></div>
        </div>
        <section className="panel commander-summary"><div><span className="eyebrow">Commanders on this wallet</span><b>{state.commanders.length} held</b><p>Every Commander is a separate NFT with its own rank and share of the rewards pool. {state.maxSupply - state.minted} remain unminted.</p></div><div><button className="btn" onClick={onRoster}>Switch commander</button><button className="btn btn-amber" onClick={onMint}>Mint more</button></div></section>
        <section className="panel operation-panel"><div className="panel-h"><h3>Operation totals</h3><span className="eyebrow">On-chain</span></div><div className="statgrid inline"><div className="stat"><div className="k">All launches</div><div className="v num">{state.totalLaunches.toLocaleString()}</div></div><div className="stat"><div className="k">WAR burned</div><div className="v num">{shortToken(state.totalBurned)}</div></div><div className="stat"><div className="k">Your WAR burned</div><div className="v num">{shortToken(selected.warBurned)}</div></div></div></section>
      </div>
      <Feed items={state.activity} tick={tick} />
    </div>
  </div>
}

function PageHead({ title, copy, tag }: { title: string; copy: string; tag?: React.ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{copy}</p></div>{tag}</div>
}

function UpgradePage({ state, selected, onUpgrade, onMint }: { state: State; selected?: Commander; onUpgrade: () => Promise<void>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Upgrade" copy="Missile level decides how much damage each hit does." /><EmptyGate onMint={onMint} /></div>
  return <div className="page">
    <PageHead title="Upgrade" copy="Missile level decides how much damage a hit does. Half of every upgrade fee is burned." tag={<span className="tag tag-amb">{selected.hits} SUCCESSFUL HITS</span>} />
    <div className="grid4">{MISSILES.map((missile) => {
      const owned = selected.missileLevel === missile.level
      const past = selected.missileLevel > missile.level
      const sequential = selected.missileLevel + 1 === missile.level
      const hitsReady = selected.hits >= missile.hits
      const canUpgrade = sequential && hitsReady && state.warBalance >= missile.cost
      return <section className={`mcard ${owned ? 'owned' : ''} ${!owned && !past && !canUpgrade ? 'locked' : ''}`} key={missile.level}>
        <div className="top"><div><div className="tier">LEVEL {missile.level}</div><div className="nm">{missile.damage.toLocaleString()}<span> DMG</span></div></div>{owned ? <span className="tag tag-fed">Equipped</span> : past ? <span className="tag tag-off">Passed</span> : <LockKeyhole size={16} />}</div>
        <div className="silo" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 11 + missile.level * 17) % 8) * 4 + missile.level * 7}%` }} />)}</div>
        <h2>{missileNames[missile.level - 1]}</h2>
        <div className="mcard-foot">{owned ? <span className="eyebrow">Currently equipped</span> : past ? <span className="eyebrow">Superseded</span> : <><div className="ledger"><div><span>Requires</span><span className={hitsReady ? '' : 'rep'}>{missile.hits} hits</span></div><div><span>Cost</span><span>{shortToken(missile.cost)} WAR</span></div><div className="burn"><span>Burned</span><span>{shortToken(missile.cost / 2n)} WAR</span></div></div><button className={`btn btn-block ${canUpgrade ? 'btn-fed' : ''}`} disabled={!canUpgrade || Boolean(state.pendingAction)} onClick={() => void onUpgrade()}>{!sequential ? 'Upgrade in order' : !hitsReady ? `${missile.hits - selected.hits} more hits` : state.warBalance < missile.cost ? 'Not enough WAR' : 'Upgrade'}</button></>}</div>
      </section>
    })}</div>
    <div className="notice page-notice">Missile level is power. Rank is reward. The two never mix.</div>
  </div>
}

function RankPage({ state, selected, onRankUp, onMint }: { state: State; selected?: Commander; onRankUp: (purchased: boolean) => Promise<void>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Rank" copy="Rank multiplies your share of every reward round." /><EmptyGate onMint={onMint} /></div>
  const ageDays = Math.floor((Date.now() / 1000 - selected.mintedAt) / 86_400)
  return <div className="page">
    <PageHead title="Rank" copy="Rank multiplies your share of PLTR rewards. Captain through Colonel can be earned or bought. General is trial-only." tag={<span className="tag tag-amb">YOUR RANK GIVES {Number(RANKS[selected.rank].multiplier) / 100}× REWARDS</span>} />
    <div className="ladder">{RANKS.map((rank, index) => {
      const current = selected.rank === index
      const done = selected.rank > index
      const next = selected.rank + 1 === index
      const hitsReady = selected.hits >= rank.hits
      const ageReady = ageDays >= rank.days
      const full = rank.seats !== null && (state.rankPopulation[index] || 0) >= rank.seats
      const earnedReady = next && hitsReady && ageReady && state.warBalance >= rank.earned && !full && index < 4
      const buyReady = next && rank.buy > 0n && state.warBalance >= rank.buy && !full
      const trialReady = next && index === 4 && !full && state.warBalance >= 800_000n * 10n ** 18n
      return <div className={`rung ${current ? 'cur' : ''} ${done ? 'done' : ''}`} key={rank.name}>
        <div className="chev"><b>{['I', 'II', 'III', 'IV', 'V'][index]}</b>{current ? 'YOU' : done ? 'HELD' : ''}</div>
        <div><h4>{rank.name}{index === 4 && <span className="eyebrow"> — trial only</span>}</h4><div className="req">{index === 0 ? 'Issued at mint' : index === 4 ? 'Ten seats. A Colonel must pass the General trial.' : `${rank.hits} successful hits · ${rank.days} day${rank.days > 1 ? 's' : ''} · ${shortToken(rank.earned)} WAR`}</div>{rank.seats !== null && <><div className="seats">{Array.from({ length: rank.seats }, (_, seat) => <i className={seat < (state.rankPopulation[index] || 0) ? 'taken' : 'free'} key={seat} />)}</div><div className="eyebrow seat-copy">{state.rankPopulation[index] || 0} / {rank.seats} seats occupied{full ? ' — full' : ''}</div></>}</div>
        <div className="mult"><span>REWARDS</span>{Number(rank.multiplier) / 100}×</div>
        <div className="rank-actions">{done ? <span className="tag tag-off">Passed</span> : current ? <span className="tag tag-amb">Current</span> : index === 4 ? <button className={`btn btn-sm btn-block ${trialReady ? 'btn-amber' : ''}`} disabled={!trialReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!next ? 'Colonels only' : full ? 'Seats full' : state.warBalance < 800_000n * 10n ** 18n ? 'Not enough WAR' : 'Enter trial · 800K WAR'}</button> : next ? <><button className={`btn btn-sm btn-block ${earnedReady ? 'btn-fed' : ''}`} disabled={!earnedReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!hitsReady ? `${rank.hits - selected.hits} more hits` : !ageReady ? `${rank.days - ageDays}d to wait` : state.warBalance < rank.earned ? 'Not enough WAR' : `Earn it · ${shortToken(rank.earned)} WAR`}</button><button className={`btn btn-sm btn-block ${buyReady ? 'btn-amber' : ''}`} disabled={!buyReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(true)}>Buy rank · {shortToken(rank.buy)} WAR</button></> : <span className="tag tag-off">Locked</span>}</div>
      </div>
    })}</div>
    <div className="grid2 rank-explain">
      <section className="panel"><div className="panel-h"><h3>Earn it</h3></div><div className="panel-b"><p>Land the hits, serve the days and pay the promotion fee. Half of every fee burns; the other half goes to the protocol treasury.</p><div className="ledger"><div><span>Captain</span><span>10 hits · 1 day · 100,000 WAR</span></div><div><span>Major</span><span>30 hits · 3 days · 300,000 WAR</span></div><div><span>Colonel</span><span>75 hits · 7 days · 900,000 WAR</span></div></div></div></section>
      <section className="panel"><div className="panel-h"><h3>Buy it</h3><span className="tag tag-amb">FROM DAY ONE</span></div><div className="panel-b"><p>Skip hits and time, one rank at a time. General is the exception: no amount of WAR buys the seat.</p><div className="ledger"><div><span>Captain</span><span>250,000 WAR</span></div><div><span>Major</span><span>750,000 WAR</span></div><div><span>Colonel</span><span>2,250,000 WAR</span></div><div className="burn"><span>Burned on purchase</span><span>50%</span></div></div></div></section>
    </div>
  </div>
}

function RewardsPage({ state, selected, tick, onClaim, onClaimAll, onClose, onLaunch, onMint }: { state: State; selected?: Commander; tick: number; onClaim: () => Promise<void>; onClaimAll: () => Promise<void>; onClose: () => Promise<void>; onLaunch: () => Promise<void>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Rewards" copy="Creator Fees are distributed to active Commanders every five hours." /><EmptyGate onMint={onMint} /></div>
  const active = selected.activeRound === state.round.id
  const rank = RANKS[selected.rank]
  const totalClaimable = Object.values(state.claimableByCommander).reduce((sum, value) => sum + value, 0n)
  const selectedClaimable = state.claimableByCommander[selected.id.toString()] ?? state.claimable
  const roundReward = state.creatorFees * 9_950n / 10_000n
  const estimated = active && state.round.totalWeight > 0n ? roundReward * rank.multiplier / state.round.totalWeight : 0n
  const closable = tick >= state.round.endsAt
  return <div className="page">
    <PageHead title="Rewards" copy="Pons Creator Fees flow into the game. Every five hours anyone can close the round; active Commander weights are settled in tokenized PLTR." tag={<span className={`tag ${active ? 'tag-fed' : 'tag-rep'}`}>{active ? "IN THIS ROUND'S SNAPSHOT" : 'LAUNCH TO QUALIFY'}</span>} />
    <div className="grid2 rewards-grid">
      <section className="panel objective"><div className="panel-h"><h3>Available to claim</h3><span className="eyebrow">Commander #{selected.id}</span></div><div className="panel-b rewards-claim"><div className="reward-number">{token(selectedClaimable)} <small>PLTR</small></div><p>Sitting in the rewards contract until you claim it.</p><button className={`btn btn-lg btn-block ${selectedClaimable > 0n ? 'btn-amber' : ''}`} disabled={selectedClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaim()}>{selectedClaimable > 0n ? `Claim ${token(selectedClaimable)} PLTR` : 'Nothing to claim yet'}</button>{state.commanders.length > 1 && <button className={`btn btn-block ${totalClaimable > 0n ? 'btn-fed' : ''}`} disabled={totalClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaimAll()}>Claim {token(totalClaimable)} PLTR across all Commanders</button>}<div className="ledger"><div><span>Wallet PLTR balance</span><span>{token(state.pltrBalance)} PLTR</span></div><div><span>Available for #{selected.id}</span><span className="amb">{token(selectedClaimable)} PLTR</span></div><div><span>Available across wallet</span><span className="fed">{token(totalClaimable)} PLTR</span></div></div></div></section>
      <section className={`panel ${closable ? 'objective' : ''}`}><div className="panel-h"><h3>Round #{state.round.id}</h3><span className={`tag ${closable ? 'tag-amb' : 'tag-off'}`}>{closable ? 'READY TO CLOSE' : `CLOSES IN ${countdown(state.round.endsAt, tick)}`}</span></div><div className="panel-b"><div className="ledger round-ledger"><div><span>Claimable in Pons Fee Escrow</span><span className="amb">{token(state.creatorFees)} PLTR</span></div><div><span>Closer fee · 0.5%</span><span>{token(state.creatorFees * 5n / 1000n)} PLTR</span></div><div><span>Round reward after closer fee</span><span>{token(roundReward)} PLTR</span></div><div><span>Total active weight</span><span>{state.round.totalWeight.toLocaleString()}</span></div><div><span>Your rank</span><span>{rank.name} · {Number(rank.multiplier) / 100}×</span></div><div><span>Your projected share</span><span className="amb">{token(estimated)} PLTR</span></div></div>{closable ? <button className="btn btn-lg btn-block btn-amber close-round" disabled={Boolean(state.pendingAction)} onClick={() => void onClose()}>Close round and keep 0.5%</button> : !active ? <button className="btn btn-block btn-fed close-round" disabled={Boolean(state.pendingAction)} onClick={() => void onLaunch()}>Launch once to enter this round</button> : <div className="round-ready"><Check size={15} /> Commander #{selected.id} is active in this round</div>}<div className="stepline vertical"><div className="st"><div className="n">STEP 1</div><div className="t">Trading volume</div><p>WAR changes hands through Pons.</p></div><div className="st"><div className="n">STEP 2</div><div className="t">Creator Fees</div><p>Swept PLTR becomes claimable in Fee Escrow.</p></div><div className="st"><div className="n">STEP 3</div><div className="t">Five-hour close</div><p>Weights freeze and rewards become claimable.</p></div></div></div></section>
    </div>
    {state.commanders.length > 1 && <section className="panel commander-rewards"><div className="panel-h"><h3>Your Commanders</h3><span className="eyebrow">Settled per NFT</span></div><table><thead><tr><th>Commander</th><th>Rank</th><th>Weight</th><th>This round</th><th className="right">Available</th></tr></thead><tbody>{state.commanders.map((commander) => <tr className={commander.id === selected.id ? 'me' : ''} key={commander.id.toString()}><td><div className="cmdr"><CommanderGlyph id={commander.id} /><span>#{commander.id}</span></div></td><td>{RANKS[commander.rank].name}</td><td className="num">{Number(RANKS[commander.rank].multiplier) / 100}×</td><td>{commander.activeRound === state.round.id ? <span className="tag tag-fed">IN</span> : <span className="tag tag-off">OUT</span>}</td><td className="num right amb">{token(state.claimableByCommander[commander.id.toString()] ?? 0n)} PLTR</td></tr>)}</tbody></table></section>}
    <section className="panel total-burned"><div className="panel-h"><h3>Total WAR burned</h3><span className="eyebrow">Removed from supply permanently</span></div><div className="panel-b"><b>{token(state.totalBurned, 18, 0)}</b><span className="eyebrow">Half of every WAR spent in the game is burned</span><p>You have burned {token(selected.warBurned, 18, 0)} WAR with Commander #{selected.id}.</p></div></section>
  </div>
}

function ActivityPage({ items, tick }: { items: Activity[]; tick: number }) {
  return <div className="page"><PageHead title="Activity" copy="Every mint, rocket launch, launcher upgrade, rank change and paid extra shot is emitted by the game contract." tag={<span className="tag tag-fed">LIVE · ON-CHAIN</span>} /><section className="activity-panel"><div className="activity-head"><span>Event</span><span>Details</span><span>Time</span><span>Transaction</span></div>{items.length ? items.map((item) => <ActivityRow item={item} tick={tick} key={item.id} />) : <div className="activity-empty">No activity found in the current RPC window.</div>}</section></div>
}

function ActivityRow({ item, tick }: { item: Activity; tick: number }) {
  const icons = { launch: Rocket, extra: Zap, mint: PackagePlus, rank: Medal, upgrade: Trophy, reward: CircleDollarSign, round: Target }
  const Icon = icons[item.kind]
  return <div className={`activity-row ${item.mine ? 'me' : ''}`}><span className={`activity-icon ${item.kind}`}><Icon size={15} /></span><div><b>{item.title}</b><small>{item.commanderId ? `Commander #${item.commanderId}` : 'Protocol event'}</small></div><div>{item.detail}</div><time>{relativeTime(item.timestamp, tick)}</time>{item.txHash ? <a href={`${EXPLORER}/tx/${item.txHash}`} target="_blank" rel="noreferrer">View tx <ExternalLink size={12} /></a> : <span className="demo-tx">DEMO</span>}</div>
}

function DocsPage() {
  return <div className="page"><PageHead title="Protocol" copy="WARROOM in plain language: everyone attacks one common target, and every five hours active Commanders divide trading fees according to rank." tag={<span className="tag tag-amb">ROBINHOOD CHAIN · 4663</span>} /><div className="explain-grid">{[
    ['01', 'Get a Commander', 'Mint an ERC-721 for 100,000 WAR. Half burns and half goes to the treasury. Its progress moves with the NFT.'],
    ['02', 'Attack together', 'Launch one free rocket every four hours, or burn/spend 10,000 WAR for an extra shot, up to three per day.'],
    ['03', 'Rise in rank', 'Hits unlock promotions and launcher upgrades. Rank controls your reward weight; General is trial-only.'],
    ['04', 'Claim PLTR', 'Pons Creator Fees settle every five hours. Anyone can close a ready round for a 0.5% closer fee.'],
  ].map(([number, title, copy]) => <article key={number}><span>{number}</span><h2>{title}</h2><p>{copy}</p></article>)}</div><section className="architecture-panel"><div><span className="eyebrow">Every WAR payment</span><h2>One spend. Two destinations.</h2><p>The game contract transfers exactly half to the irrecoverable burn address and half to the configured treasury in the same transaction.</p></div><div className="split-diagram"><span><b>100% WAR</b><small>player approval</small></span><i /><span className="burn-node"><b>50% BURN</b><small>0x…dEaD</small></span><i /><span><b>50% TREASURY</b><small>configured wallet</small></span></div></section><ProtocolContracts /><div className="notice legal">The target and hardware are fictional. Tokenized stock transfers may be jurisdiction-restricted. Contract code should receive an independent audit before mainnet deployment.</div></div>
}

function ProtocolContracts() {
  return <div className="contracts"><div><span>Network</span><b>Robinhood Chain</b><small>Chain ID 4663</small></div><div><span>WARROOM Game</span><b>{CONTRACTS.game === '0x0000000000000000000000000000000000000000' ? 'Awaiting deployment' : shortAddress(CONTRACTS.game)}</b>{CONTRACTS.game !== '0x0000000000000000000000000000000000000000' && <a href={`${EXPLORER}/address/${CONTRACTS.game}`} target="_blank" rel="noreferrer">Explorer <ExternalLink size={11} /></a>}</div><div><span>Reward asset</span><b>Tokenized PLTR</b><a href={`${EXPLORER}/token/${CONTRACTS.pltr}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.pltr)} <ExternalLink size={11} /></a></div><div><span>Creator Fees</span><b>Pons V2 Fee Escrow</b><a href={`${EXPLORER}/address/${CONTRACTS.ponsFeeEscrow}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.ponsFeeEscrow)} <ExternalLink size={11} /></a></div></div>
}

function MintModal({ state, quantity, setQuantity, onClose, onMint }: { state: State; quantity: number; setQuantity: (value: number) => void; onClose: () => void; onMint: () => Promise<void> }) {
  const remaining = state.maxSupply - state.minted
  const maxQuantity = Math.max(1, Math.min(25, remaining))
  const cost = MINT_PRICE * BigInt(quantity)
  const canMint = remaining > 0 && state.connected && state.warBalance >= cost && !state.pendingAction
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal mint-modal" role="dialog" aria-modal="true" aria-labelledby="mint-title"><div className="modal-head"><div><span className="eyebrow">ERC-721 · MAX 1,200</span><h2 id="mint-title">Mint Commander</h2></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="mint-visual"><CommanderGlyph id={BigInt(state.minted + 1)} size={78} /><div><span>Next assignment</span><b>#{String(state.minted + 1).padStart(3, '0')}</b><small>Recruit · Missile Level 1</small></div></div><div className="quantity-row"><span>Quantity</span><div><button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>−</button><b>{quantity}</b><button onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} disabled={quantity >= maxQuantity}>+</button></div></div><div className="presets">{[1, 2, 5, 10].map((value) => <button className={quantity === value ? 'on' : ''} disabled={value > maxQuantity} onClick={() => setQuantity(value)} key={value}>{value}</button>)}<button disabled={!remaining} onClick={() => setQuantity(maxQuantity)}>MAX</button></div><div className="supply-row"><span>{state.minted.toLocaleString()} / {state.maxSupply.toLocaleString()} minted</span><div className="bar"><i style={{ transform: `scaleX(${state.minted / state.maxSupply})` }} /></div></div><div className="ledger mint-ledger"><div><span>{quantity} × 100,000</span><span>{shortToken(cost)} WAR</span></div><div className="burn"><span>Burned forever</span><span>{shortToken(cost / 2n)} WAR · 50%</span></div><div><span>Protocol treasury</span><span>{shortToken(cost / 2n)} WAR · 50%</span></div></div><button className={`btn btn-lg btn-block ${canMint ? 'btn-amber' : ''}`} disabled={!canMint} onClick={() => void onMint()}>{remaining <= 0 ? 'Sold out' : state.warBalance < cost ? 'Not enough WAR' : `Mint ${quantity} Commander${quantity > 1 ? 's' : ''}`}</button><p className="modal-note">Rank, launcher level, hits and damage live on the NFT and move with it when transferred.</p></section></div>
}

function RosterModal({ state, selected, onClose, onSelect, onMint }: { state: State; selected?: Commander; onClose: () => void; onSelect: (id: bigint) => void; onMint: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal roster-modal" role="dialog" aria-modal="true" aria-labelledby="roster-title"><div className="modal-head"><div><span className="eyebrow">Your wallet</span><h2 id="roster-title">Select Commander</h2></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="roster-list">{state.commanders.length ? state.commanders.map((commander) => <button className={selected?.id === commander.id ? 'selected' : ''} onClick={() => onSelect(commander.id)} key={commander.id.toString()}><CommanderGlyph id={commander.id} size={34} /><span><b>Commander #{commander.id}</b><small>{RANKS[commander.rank].name} · Missile Level {commander.missileLevel} · {commander.hits} hits</small></span>{selected?.id === commander.id && <Check size={17} />}</button>) : <div className="roster-empty"><Shield size={34} /><p>No Commander NFTs found on this wallet.</p></div>}</div><button className="btn btn-block btn-amber" onClick={onMint}><PackagePlus size={15} /> Mint more</button></section></div>
}
