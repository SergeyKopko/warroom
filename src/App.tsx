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
import { CONTRACTS, EXPLORER, EXTRA_SHOT_PRICE, FREE_SHOT_COOLDOWN, MINT_PRICE, MISSILES, RANKS, isConfigured } from './config'
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
const WAR_MARKET = 'https://gmgn.ai/robinhood/token/0x48a9e2ec1ead16c709e1187ac13e7434f9b21a16'

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
  return <span className={`cmd-avatar ${size >= 48 ? 'cmd-avatar-large' : ''}`} style={{ width: size, height: size }} aria-hidden="true"><img src="/commander-nft-320.png" alt="" width="320" height="320" loading="eager" decoding="sync" fetchPriority="high" /><b>#{id}</b></span>
}

function Brand({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button className={`brand ${compact ? 'landbrand' : ''}`} onClick={onClick} title="Back to the front page">
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
                <span className="dim">·</span><span className="amb num">{shortToken(state.walletWarBalance ?? state.warBalance)} WAR</span>
              </button>
              <button className="hbtn" onClick={openMint}>+ Commander</button>
              <a className="hbtn amb" href={WAR_MARKET} target="_blank" rel="noreferrer">Buy WAR</a>
            </div>
          </header>
          {state.demo ? <div className="classbar"><span>Local development demo · no transactions</span><button onClick={actions.resetDemo}>Reset local state</button></div> : !isConfigured ? <div className="classbar"><span>WARROOM contract awaiting deployment · game transactions disabled</span><a href="/deploy">Deployment console</a></div> : null}
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

      {rosterOpen && <RosterModal state={state} selected={selected} onClose={() => setRosterOpen(false)} onSelect={(id) => { actions.select(id); setRosterOpen(false) }} onMint={() => { setRosterOpen(false); openMint() }} onClaimAll={actions.claimAll} onRevoke={actions.revokeWarAllowance} />}
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
    <div className="classbar"><span>Warroom · Robinhood Chain · chain 4663 · rewards in tokenized PLTR</span><span>{state.demo ? 'Local development demo' : !isConfigured ? 'Awaiting game deployment' : `Round #${state.round.id} · ${countdown(state.round.endsAt, tick)}`}</span></div>
    <div className="landhead">
      <Brand compact onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <div className="land-actions">
        {state.connected && <button className="wallet" onClick={onRoster}>{selected ? <CommanderGlyph id={selected.id} size={16} /> : <Wallet size={15} />}<span>{selected ? `#${selected.id}` : shortAddress(state.address)}</span>{selected && <span className="dim">{RANKS[selected.rank].name}</span>}<span className="amb num">{shortToken(state.walletWarBalance ?? state.warBalance)} WAR</span></button>}
        <button className="hbtn" onClick={onDocs}>Docs</button>
        {state.connected && <button className="hbtn" onClick={onMint}>+ Commander</button>}
        <a className="hbtn amb" href={WAR_MARKET} target="_blank" rel="noreferrer">Buy WAR</a>
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
          <Feed items={state.activity} tick={tick} maxHeight={420} />
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
        <footer className="foot"><span>Warroom · <button onClick={onDocs}>Docs and FAQ</button></span><span>Robinhood Chain · WAR / PLTR · rewards in tokenized PLTR</span></footer>
      </div>
    </main>
  </>
}

function EnemyPanel({ state }: { state: State }) {
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const damage = state.targetMaxHp - state.targetHp
  return <section className="hp-wrap" aria-label={`Enemy integrity ${integrity.toFixed(1)} percent`}>
    <div className="hp-top"><div><div className="eyebrow">Shared target · cycle {state.targetCycle}</div><div className="eyebrow enemy-integrity-label">Enemy integrity</div><div className="big rep">{integrity.toFixed(1)}<span>%</span></div></div><div className="enemy-damage"><div className="eyebrow">Damage this cycle</div><div className="num">{damage.toLocaleString()}</div></div></div>
    <div className="hp-track"><div className="hp-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, integrity / 100)).toFixed(4)})` }} /></div>
    <div className="hp-meta eyebrow"><span>{state.targetHp.toLocaleString()} HP remaining</span><span>At zero the target resets and cycle {String(state.targetCycle + 1).padStart(2, '0')} begins</span></div>
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

function Feed({ items, tick, maxHeight }: { items: Activity[]; tick: number; maxHeight?: number }) {
  return <section className="panel feed-panel"><div className="panel-h"><h3>Activity</h3><span className="eyebrow">Live</span></div><div className="feed" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>{items.slice(0, 14).map((item) => <div className={`fitem ${item.mine ? 'me' : ''}`} key={item.id}><span className="ts">{relativeTime(item.timestamp, tick)}</span><div className="bd"><b>{item.title}</b><span>{item.detail}</span></div></div>)}</div></section>
}

function EmptyGate({ onMint }: { onMint: () => void }) {
  return <section className="panel empty-gate"><Radar size={40} /><h2>Commander required</h2><p>Mint the NFT that carries your rank, launcher level and battle history.</p><button className="btn btn-lg btn-amber" onClick={onMint}>Mint Commander</button></section>
}

function PlayPage({ state, selected, tick, onLaunch, onMint, onRoster }: { state: State; selected?: Commander; tick: number; onLaunch: (paid: boolean) => Promise<{ hit: boolean; damage: bigint } | void>; onMint: () => void; onRoster: () => void }) {
  const [pulse, setPulse] = useState(0)
  const [strike, setStrike] = useState<{ hit: boolean; damage: bigint; at: number }>()
  if (!selected) return <div className="page"><EnemyPanel state={state} /><EmptyGate onMint={onMint} /></div>
  const missile = MISSILES[selected.missileLevel - 1]
  const rank = RANKS[selected.rank]
  const next = selected.rank < 4 ? RANKS[selected.rank + 1] : undefined
  const cooldown = Math.max(0, selected.lastLaunchAt + FREE_SHOT_COOLDOWN - tick)
  const today = Math.floor(tick / 86_400)
  const extras = selected.extraDay === today ? selected.extraCount : 0
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const fire = async (paid: boolean) => {
    try {
      const result = await onLaunch(paid)
      if (result) {
        setPulse((value) => value + 1)
        setStrike({ ...result, at: Date.now() })
      }
    } catch { /* Shared error toast already explains a rejected/reverted transaction. */ }
  }
  const projected = selected.activeRound === state.round.id && state.round.totalWeight > 0n
    ? state.creatorFees * 9_950n / 10_000n * rank.multiplier / state.round.totalWeight
    : 0n
  return <div className="page">
    {strike && <div className="stamp-l" key={strike.at}><div className="stamp" style={{ color: strike.hit ? 'var(--amber)' : 'var(--faint)' }}><div className="big">{strike.hit ? 'Target hit' : 'Intercepted'}</div><div className="sm">{strike.hit ? `+${strike.damage.toLocaleString()} damage` : 'No damage'}</div></div></div>}
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
        {selected.activeRound !== state.round.id && selected.launches > 0 && <div className="notice page-notice">You are not in round #{state.round.id}. One launch since the last round closed is all it takes to be counted.</div>}
        <section className="panel damage-board"><div className="panel-h"><h3>Top damage</h3><span className="eyebrow">Commanders on this wallet</span></div><table><thead><tr><th className="rk">#</th><th>Commander</th><th>Missile</th><th className="right">Damage</th></tr></thead><tbody>{[...state.commanders].sort((a, b) => Number(b.totalDamage - a.totalDamage)).slice(0, 10).map((commander, index) => <tr className={commander.id === selected.id ? 'me' : ''} key={commander.id.toString()}><td className={`rk ${index < 3 ? 'top' : ''}`}>{String(index + 1).padStart(2, '0')}</td><td><div className="cmdr"><CommanderGlyph id={commander.id} size={22} /><div><b>{commander.id === selected.id ? 'YOU' : `COMMANDER #${commander.id}`}</b><div className="eyebrow">#{commander.id}</div></div></div></td><td className="dim">Level {commander.missileLevel}</td><td className="num right">{commander.totalDamage.toLocaleString()}</td></tr>)}</tbody></table></section>
      </div>
      <Feed items={state.activity} tick={tick} />
    </div>
  </div>
}

function PageHead({ title, copy, tag }: { title: string; copy: string; tag?: React.ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{copy}</p></div>{tag}</div>
}

function UpgradePage({ state, selected, onUpgrade, onMint }: { state: State; selected?: Commander; onUpgrade: () => Promise<unknown>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Arsenal" copy="Missile level decides how much damage each hit does." /><EmptyGate onMint={onMint} /></div>
  return <div className="page">
    <PageHead title="Arsenal" copy="Missile level decides how much damage a hit does. Nothing else. Half of every upgrade fee is burned." tag={<span className="tag tag-amb">{selected.hits} SUCCESSFUL HITS</span>} />
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
        <div className="mcard-foot">{owned ? <span className="eyebrow">Currently equipped</span> : past ? <span className="eyebrow">Superseded</span> : <><div className="ledger"><div><span>Requires</span><span className={hitsReady ? '' : 'rep'}>{missile.hits} hits</span></div><div><span>Cost</span><span>{shortToken(missile.cost)} WAR</span></div><div className="burn"><span>Burned</span><span>{shortToken(missile.cost / 2n)} WAR</span></div></div>{sequential && !hitsReady && <><div className="bar upgrade-progress"><i style={{ transform: `scaleX(${Math.min(1, selected.hits / missile.hits).toFixed(4)})` }} /></div><div className="eyebrow upgrade-progress-label">{selected.hits} / {missile.hits} hits</div></>}<button className={`btn btn-block ${canUpgrade ? 'btn-fed' : ''}`} disabled={!canUpgrade || Boolean(state.pendingAction)} onClick={() => void onUpgrade()}>{!sequential ? 'Upgrade in order' : !hitsReady ? `${missile.hits - selected.hits} more hits` : state.warBalance < missile.cost ? 'Not enough WAR' : 'Upgrade'}</button></>}</div>
      </section>
    })}</div>
    <div className="notice page-notice">Missile level is power. Rank is reward. The two never mix.</div>
  </div>
}

function RankPage({ state, selected, onRankUp, onMint }: { state: State; selected?: Commander; onRankUp: (purchased: boolean) => Promise<unknown>; onMint: () => void }) {
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
        <div><h4>{rank.name}{index === 4 && <span className="eyebrow"> — trial only</span>}</h4><div className="req">{index === 0 ? 'Issued at mint' : index === 4 ? 'Ten seats. A Colonel must enter the on-chain General trial.' : `${rank.hits} successful hits · ${rank.days} day${rank.days > 1 ? 's' : ''} · ${shortToken(rank.earned)} WAR`}</div>{rank.seats !== null && <><div className="seats">{Array.from({ length: rank.seats }, (_, seat) => <i className={seat < (state.rankPopulation[index] || 0) ? 'taken' : 'free'} key={seat} />)}</div><div className="eyebrow seat-copy">{state.rankPopulation[index] || 0} / {rank.seats} seats occupied{full ? ' — full' : ''}</div></>}{next && index < 4 && !hitsReady && <><div className="bar rank-progress"><i style={{ transform: `scaleX(${Math.min(1, selected.hits / rank.hits).toFixed(4)})` }} /></div><div className="eyebrow rank-progress-label">{selected.hits} / {rank.hits} hits</div></>}</div>
        <div className="mult"><span>REWARDS</span>{Number(rank.multiplier) / 100}×</div>
        <div className="rank-actions">{done ? <span className="tag tag-off">Passed</span> : current ? <span className="tag tag-amb">Current</span> : index === 4 ? <button className={`btn btn-sm btn-block ${trialReady ? 'btn-amber' : ''}`} disabled={!trialReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!next ? 'Colonels only' : full ? 'Seats full' : state.warBalance < 800_000n * 10n ** 18n ? 'Not enough WAR' : 'Enter trial · 800K WAR'}</button> : next ? <><button className={`btn btn-sm btn-block ${earnedReady ? 'btn-fed' : ''}`} disabled={!earnedReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!hitsReady ? `${rank.hits - selected.hits} more hits` : !ageReady ? `${rank.days - ageDays}d to wait` : state.warBalance < rank.earned ? 'Not enough WAR' : `Earn it · ${shortToken(rank.earned)} WAR`}</button><button className={`btn btn-sm btn-block ${buyReady ? 'btn-amber' : ''}`} disabled={!buyReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(true)}>Buy rank · {shortToken(rank.buy)} WAR</button></> : <span className="tag tag-off">Locked</span>}</div>
      </div>
    })}</div>
    <div className="grid2 rank-explain">
      <section className="panel"><div className="panel-h"><h3>Earn it</h3></div><div className="panel-b"><p>Land the hits, serve the days and pay the promotion fee. Half of every fee burns; the other half goes to the protocol treasury.</p><div className="ledger"><div><span>Captain</span><span>10 hits · 1 day · 100,000 WAR</span></div><div><span>Major</span><span>30 hits · 3 days · 300,000 WAR</span></div><div><span>Colonel</span><span>75 hits · 7 days · 900,000 WAR</span></div></div></div></section>
      <section className="panel"><div className="panel-h"><h3>Buy it</h3><span className="tag tag-amb">FROM DAY ONE</span></div><div className="panel-b"><p>Skip hits and time, one rank at a time. General is the exception: no amount of WAR buys the seat.</p><div className="ledger"><div><span>Captain</span><span>250,000 WAR</span></div><div><span>Major</span><span>750,000 WAR</span></div><div><span>Colonel</span><span>2,250,000 WAR</span></div><div className="burn"><span>Burned on purchase</span><span>50%</span></div></div></div></section>
    </div>
    {selected.activeRound === state.round.id && <div className="notice page-notice">Commander #{selected.id} entered round #{state.round.id} at {Number(RANKS[selected.rank].multiplier) / 100}×. A later promotion applies to the next reward round because the current weight is already recorded on-chain.</div>}
  </div>
}

function RewardsPage({ state, selected, tick, onClaim, onClaimAll, onClose, onLaunch, onMint }: { state: State; selected?: Commander; tick: number; onClaim: () => Promise<unknown>; onClaimAll: () => Promise<unknown>; onClose: () => Promise<unknown>; onLaunch: () => Promise<unknown>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Rewards" copy="Creator Fees are distributed to active Commanders every five hours." /><EmptyGate onMint={onMint} /></div>
  const active = selected.activeRound === state.round.id
  const rank = RANKS[selected.rank]
  const totalClaimable = Object.values(state.claimableByCommander).reduce((sum, value) => sum + value, 0n)
  const selectedClaimable = state.claimableByCommander[selected.id.toString()] ?? state.claimable
  const roundReward = state.creatorFees * 9_950n / 10_000n
  const estimated = active && state.round.totalWeight > 0n ? roundReward * rank.multiplier / state.round.totalWeight : 0n
  const closable = tick >= state.round.endsAt
  const combinedWeight = state.commanders.reduce((sum, commander) => sum + (commander.activeRound === state.round.id ? RANKS[commander.rank].multiplier : 0n), 0n)
  return <div className="page">
    <PageHead title="Rewards" copy="Pons Creator Fees flow into the game. Every five hours anyone can close the round; active Commander weights are settled in tokenized PLTR." tag={<span className={`tag ${active ? 'tag-fed' : 'tag-rep'}`}>{active ? "IN THIS ROUND'S SNAPSHOT" : 'LAUNCH TO QUALIFY'}</span>} />
    <div className="grid2 rewards-grid">
      <section className="panel objective"><div className="panel-h"><h3>Available to claim</h3><span className="eyebrow">Commander #{selected.id}</span></div><div className="panel-b rewards-claim"><div className="reward-number">{token(selectedClaimable)} <small>PLTR</small></div><p>Sitting in the rewards contract until you claim it.</p><button className={`btn btn-lg btn-block ${selectedClaimable > 0n ? 'btn-amber' : ''}`} disabled={selectedClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaim()}>{selectedClaimable > 0n ? `Claim ${token(selectedClaimable)} PLTR` : 'Nothing to claim yet'}</button>{state.commanders.length > 1 && <button className={`btn btn-block ${totalClaimable > 0n ? 'btn-fed' : ''}`} disabled={totalClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaimAll()}>Claim {token(totalClaimable)} PLTR across all Commanders</button>}<div className="ledger"><div><span>Wallet PLTR balance</span><span>{token(state.pltrBalance)} PLTR</span></div><div><span>Available for #{selected.id}</span><span className="amb">{token(selectedClaimable)} PLTR</span></div><div><span>Available across wallet</span><span className="fed">{token(totalClaimable)} PLTR</span></div></div><div className="eyebrow reward-history-note">Every closed round is checked. Earned PLTR never expires; long histories are claimed in gas-safe batches.</div><div className="pltr-explain"><div className="eyebrow">What PLTR is doing here</div><p>WAR is the fuel: minting, upgrades, rank and extra launches spend it, and half burns. Rewards come back in a different asset — tokenized PLTR — so WAR only ever leaves circulation.</p><div className="ledger"><div><span>Spend to play</span><span>WAR</span></div><div><span>Earn as rewards</span><span className="amb">Tokenized PLTR</span></div><div><span>Market pair</span><span>WAR / PLTR</span></div></div></div></div></section>
      <section className={`panel ${closable ? 'objective' : ''}`}><div className="panel-h"><h3>Round #{state.round.id}</h3><span className={`tag ${closable ? 'tag-amb' : 'tag-off'}`}>{closable ? 'READY TO CLOSE' : `CLOSES IN ${countdown(state.round.endsAt, tick)}`}</span></div><div className="panel-b"><div className="ledger round-ledger"><div><span>Claimable in Pons Fee Escrow</span><span className="amb">{token(state.creatorFees)} PLTR</span></div><div><span>Closer fee · 0.5%</span><span>{token(state.creatorFees * 5n / 1000n)} PLTR</span></div><div><span>Round reward after closer fee</span><span>{token(roundReward)} PLTR</span></div><div><span>Total active weight</span><span>{state.round.totalWeight.toLocaleString()}</span></div><div><span>Your rank</span><span>{rank.name} · {Number(rank.multiplier) / 100}×</span></div><div><span>Your projected share</span><span className="amb">{token(estimated)} PLTR</span></div></div>{closable ? <button className="btn btn-lg btn-block btn-amber close-round" disabled={Boolean(state.pendingAction)} onClick={() => void onClose()}>Close round and keep 0.5%</button> : !active ? <button className="btn btn-block btn-fed close-round" disabled={Boolean(state.pendingAction)} onClick={() => void onLaunch()}>Launch once to enter this round</button> : <div className="round-ready"><Check size={15} /> Commander #{selected.id} is active in this round</div>}<div className="stepline vertical"><div className="st"><div className="n">STEP 1</div><div className="t">Trading volume</div><p>WAR changes hands through Pons.</p></div><div className="st"><div className="n">STEP 2</div><div className="t">Creator Fees</div><p>Swept PLTR becomes claimable in Fee Escrow.</p></div><div className="st"><div className="n">STEP 3</div><div className="t">Five-hour close</div><p>Weights freeze and rewards become claimable.</p></div></div></div></section>
    </div>
    {state.commanders.length > 1 && <section className="panel commander-rewards"><div className="panel-h"><h3>Your Commanders</h3><span className="eyebrow">Settled per NFT</span></div><table><thead><tr><th>Commander</th><th>Rank</th><th>Weight</th><th>This round</th><th className="right">Available</th></tr></thead><tbody>{state.commanders.map((commander) => <tr className={commander.id === selected.id ? 'me' : ''} key={commander.id.toString()}><td><div className="cmdr"><CommanderGlyph id={commander.id} /><span>#{commander.id}</span></div></td><td>{RANKS[commander.rank].name}</td><td className="num">{Number(RANKS[commander.rank].multiplier) / 100}×</td><td>{commander.activeRound === state.round.id ? <span className="tag tag-fed">IN</span> : <span className="tag tag-off">OUT</span>}</td><td className="num right amb">{token(state.claimableByCommander[commander.id.toString()] ?? 0n)} PLTR</td></tr>)}</tbody></table></section>}
    <section className="panel recent-rounds"><div className="panel-h"><h3>Recent rounds</h3><span className="eyebrow">On-chain history for Commander #{selected.id}</span></div>{state.roundHistory.length ? <table><thead><tr><th>Round</th><th>Pool</th><th>Your weight</th><th>Closed</th><th className="right">Credited</th><th className="right">Result</th></tr></thead><tbody>{state.roundHistory.map((history) => {
      const share = history.totalWeight > 0n ? history.reward * history.commanderWeight / history.totalWeight : 0n
      const status = history.commanderWeight === 0n ? 'Missed' : share === 0n ? 'No reward' : history.claimed ? 'Claimed' : 'Available'
      return <tr key={history.id}><td className="num">#{history.id}</td><td className="num">{token(history.reward)} PLTR</td><td className="num">{Number(history.commanderWeight) / 100}×</td><td className="num dim">{history.closedAt ? new Date(history.closedAt * 1000).toLocaleDateString() : '—'}</td><td className="num right">{share ? `${token(share)} PLTR` : '—'}</td><td className="right"><span className={`tag ${status === 'Available' ? 'tag-amb' : status === 'Claimed' ? 'tag-fed' : 'tag-off'}`}>{status}</span></td></tr>
    })}</tbody></table> : <div className="panel-b"><div className="eyebrow empty-rounds">No rounds have closed for this Commander yet.</div></div>}</section>
    <div className="grid2 rewards-rules"><section className="panel"><div className="panel-h"><h3>Weights</h3></div><div className="panel-b"><div className="ledger">{RANKS.map((item, index) => <div key={item.name}><span>{item.name}</span><span className={index === selected.rank ? 'amb' : ''}>{Number(item.multiplier) / 100}×</span></div>)}</div><p>Your share is your recorded weight divided by everyone in the snapshot. Your wallet currently has {Number(combinedWeight) / 100}× recorded in round #{state.round.id}.</p></div></section><section className="panel"><div className="panel-h"><h3>Rules worth knowing</h3></div><div className="panel-b"><div className="ledger"><div><span>Round length</span><span>5 hours</span></div><div><span>Counts as active</span><span>One launch since the last close</span></div><div><span>Snapshot</span><span>Weight recorded on first launch</span></div><div><span>Empty round</span><span>No PLTR is pulled</span></div><div><span>Unclaimed rewards</span><span className="amb">Never expire</span></div><div><span>Who closes the round</span><span>Anyone · keeps 0.5%</span></div><div><span>Settlement</span><span>Per NFT</span></div></div><div className="notice rewards-rule-notice">No trading volume means no Creator Fees and an empty reward pool. Rank changes your share; it cannot create PLTR.</div></div></section></div>
    <section className="panel total-burned"><div className="panel-h"><h3>Total WAR burned</h3><span className="eyebrow">Removed from supply permanently</span></div><div className="panel-b"><b>{token(state.totalBurned, 18, 0)}</b><span className="eyebrow">Half of every WAR spent in the game is burned</span><p>You have burned {token(selected.warBurned, 18, 0)} WAR with Commander #{selected.id}.</p></div></section>
  </div>
}

function ActivityPage({ items, tick }: { items: Activity[]; tick: number }) {
  return <div className="page"><PageHead title="Activity" copy="One shared event history for every visitor. Live updates do not require a connected wallet; connecting one only marks your events." tag={<span className="tag tag-fed">LIVE · GLOBAL</span>} /><section className="activity-panel"><div className="activity-head"><span>Event</span><span>Details</span><span>Time</span><span>Transaction</span></div>{items.length ? items.map((item) => <ActivityRow item={item} tick={tick} key={item.id} />) : <div className="activity-empty">No indexed activity yet.</div>}</section></div>
}

function ActivityRow({ item, tick }: { item: Activity; tick: number }) {
  const icons = { launch: Rocket, extra: Zap, mint: PackagePlus, rank: Medal, upgrade: Trophy, target: Target, fees: CircleDollarSign, reward: CircleDollarSign, round: Shield }
  const Icon = icons[item.kind]
  return <div className={`activity-row ${item.mine ? 'mine' : ''} ${item.status === 'pending' ? 'pending' : ''}`}><span className={`activity-icon ${item.kind}`}><Icon size={15} /></span><div><b>{item.title}</b><small>{item.status === 'pending' ? 'Pending confirmation' : item.commanderId ? `Commander #${item.commanderId}` : 'Protocol event'}</small></div><div>{item.detail}</div><time>{relativeTime(item.timestamp, tick)}</time>{item.txHash ? <a href={`${EXPLORER}/tx/${item.txHash}`} target="_blank" rel="noreferrer">{item.status === 'pending' ? 'Pending' : 'View tx'} <ExternalLink size={12} /></a> : <span className="demo-tx">DEMO</span>}</div>
}

const protocolToc = [
  ['what', 'What Warroom is'], ['nft', 'The Commander NFT'], ['war', 'WAR and the burn'],
  ['launch', 'Launching'], ['target', 'The shared target'], ['missile', 'Missile levels'],
  ['rank', 'Rank and seats'], ['rewards', 'Rewards and claiming'], ['activity', 'Global Activity'],
  ['network', 'Network and wallets'], ['contracts', 'Contracts'], ['risk', 'Risks'], ['faq', 'FAQ'],
] as const

const protocolFaq = [
  ['Do I need a Commander NFT to play?', 'Yes. Activity and Docs are public, but launching and progression require an ERC-721 Commander owned by the connected wallet.'],
  ['Can I hold more than one Commander?', 'Yes. Every NFT keeps separate rank, missile level, hits, damage and rewards. You can switch between them or mint more.'],
  ['Does progress move when I sell the NFT?', 'Yes. Progress is stored against the token ID in WarroomGame, so it remains attached to that Commander after a transfer.'],
  ['Can I buy General?', 'No. Captain, Major and Colonel may be bought one step at a time. General uses the deployed trial entry and is limited to ten seats.'],
  ['Do rewards expire?', 'No. Settled PLTR stays reserved for the Commander until its current owner claims it. The interface checks all closed rounds and submits long histories in safe batches.'],
  ['Why can Available to claim be zero?', 'A Commander must launch during the round, the round must be closed, and the game must have received PLTR Creator Fees. No trading fees means no reward.'],
] as const

function ProtocolFaq({ question, answer }: { question: string; answer: string }) {
  return <details className="faq"><summary>{question}</summary><div className="a">{answer}</div></details>
}

function DocsPage() {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <div className="page">
    <PageHead title="Docs" copy="Everything WARROOM does on-chain: what burns, how progression changes, where PLTR comes from and what can go wrong." tag={<span className="tag tag-amb">ROBINHOOD CHAIN · 4663</span>} />
    <div className="docs">
      <nav className="toc" aria-label="Documentation sections">{protocolToc.map(([id, title], index) => <a href={`#${id}`} onClick={(event) => { event.preventDefault(); jump(id) }} key={id}><i>{String(index + 1).padStart(2, '0')}</i>{title}</a>)}</nav>
      <div className="doc">
        <section id="what"><h2>What Warroom is</h2><p className="lead">Everyone attacks one common target. Each Commander grows independently, and every five hours the active Commanders divide collected PLTR according to their rank weight.</p><p><b>WAR is fuel.</b> It pays for minting, extra launches, missile upgrades and ranks. <b>Tokenized PLTR is the reward.</b> It is pulled from Pons Creator Fees when a round closes. The game does not mint either token.</p></section>
        <section id="nft"><h2>The Commander NFT</h2><p>A Commander is an ERC-721 and the on-chain record for one player character. Mint price is <b>100,000 WAR</b>, maximum supply is <b>1,200</b>, and a wallet may own multiple Commanders.</p><p>Rank, missile level, hits, launches, total damage, WAR spent and WAR burned are stored by token ID. A transfer therefore moves the real progression with the NFT.</p></section>
        <section id="war"><h2>WAR and the burn</h2><p>Every paid game action calls the same split inside WarroomGame: exactly half is transferred to <b>0x…dEaD</b> and exactly half to the configured treasury. The backend never handles these funds.</p><table><thead><tr><th>Action</th><th>WAR cost</th><th>Burned</th></tr></thead><tbody><tr><td>Mint Commander</td><td>100,000</td><td>50,000</td></tr><tr><td>Extra launch</td><td>10,000</td><td>5,000</td></tr><tr><td>Missile / rank upgrade</td><td>Level-dependent</td><td>50%</td></tr></tbody></table></section>
        <section id="launch"><h2>Launching</h2><p>Each Commander gets one free launch every four hours. Up to three additional launches per UTC day cost <b>10,000 WAR</b> each. A launch has a 70% hit threshold in the deployed contract; only a successful hit increments the hit counter used by Upgrade and Rank.</p><p>The browser requests the transaction, but the contract decides the outcome and updates all counters. After the receipt, the UI rereads the Commander from chain; Activity independently confirms the emitted event.</p></section>
        <section id="target"><h2>The shared target</h2><p>All successful hits reduce the same <b>100,000,000 HP</b> target. When damage reaches zero, the contract emits TargetDestroyed, advances the cycle and immediately restores full HP. Commander progression remains unchanged.</p></section>
        <section id="missile"><h2>Missile levels</h2><table><thead><tr><th>Level</th><th>Damage</th><th>Required hits</th><th>Cost</th></tr></thead><tbody>{MISSILES.map((missile) => <tr key={missile.level}><td>{missile.level}</td><td>{missile.damage.toLocaleString()}</td><td>{missile.hits || 'Issued at mint'}</td><td>{missile.cost ? `${shortToken(missile.cost)} WAR` : 'Free'}</td></tr>)}</tbody></table><p>Levels unlock in order. The Arsenal progress bar uses the selected Commander's live successful-hit count, so misses and wallet activity from other NFTs do not reduce its requirement.</p></section>
        <section id="rank"><h2>Rank and seats</h2><p>Rank controls reward weight, not missile damage. Recruit, Captain, Major, Colonel and General use weights of 1×, 1.4×, 1.9×, 2.5× and 4×. Major has 100 seats, Colonel 30 and General 10.</p><p>Captain through Colonel may be earned after the hit/time requirements and fee, or bought immediately for a larger fee. Promotions are sequential. The deployed General rule allows only a Colonel to enter for 800,000 WAR while a seat is open.</p><div className="notice">A Commander's weight is recorded on its first launch in a round. A promotion after that launch changes future rounds, not the already-recorded current-round weight.</div></section>
        <section id="rewards"><h2>Rewards and claiming</h2><p>When the five-hour timer expires, anyone may close the round. WarroomGame first asks the Pons V2 Fee Escrow for PLTR credited to the game, pays the closer 0.5%, and reserves the rest pro-rata by each active Commander's recorded weight.</p><p>Claiming is owner-only and permissionless in time: settled rewards do not expire. The interface totals all closed rounds, and long histories are submitted in bounded batches so an ever-growing list cannot exceed transaction gas limits.</p><div className="notice">The temporary WAR token currently connected to this deployment reports <b>0 PLTR</b> credited to WarroomGame. For production rewards, the final Pons V2 WAR/PLTR launch must set WarroomGame as the Creator Fees recipient at token creation.</div></section>
        <section id="activity"><h2>Global Activity</h2><p>Activity is shared by every visitor and works without a wallet. A Vercel indexer reads only the fixed WarroomGame address, waits for confirmations, stores canonical events in Neon and serves cursor history plus realtime updates. Connecting a wallet only adds the <b>mine</b> marker.</p></section>
        <section id="network"><h2>Network and wallets</h2><p>WARROOM runs on Robinhood Chain, chain ID 4663. An injected EVM wallet such as MetaMask or Rabby can connect. The app switches or adds the chain when needed, approves only the exact WAR amount for a paid action, and never sees a seed phrase or private key.</p></section>
        <section id="contracts"><h2>Contracts</h2><p>Always verify addresses in the explorer before signing. The current WAR address is a real temporary token used for live integration, while the displayed symbol remains WAR.</p><ProtocolContracts /></section>
        <section id="risk"><h2>Risks</h2><ul><li><b>No volume means no rewards.</b> Rank changes the split of a real fee pool; it cannot create PLTR.</li><li><b>Paid actions are irreversible.</b> Half of WAR is burned and cannot be recovered.</li><li><b>Seat limits are global.</b> A qualifying transaction can fail if another user fills the last seat first.</li><li><b>Launch outcomes are probabilistic.</b> Contract block inputs are used; this is not a cryptographic VRF.</li><li><b>The deployed contract is an MVP.</b> It should receive an independent audit before wider production use.</li></ul></section>
        <section id="faq" style={{ borderBottom: 0 }}><h2>FAQ</h2>{protocolFaq.map(([question, answer]) => <ProtocolFaq question={question} answer={answer} key={question} />)}</section>
      </div>
    </div>
    <div className="notice legal">The target, ranks and hardware are fictional. Tokenized stock transfers may be jurisdiction-restricted. Nothing here is financial, legal or tax advice.</div>
  </div>
}

function ProtocolContracts() {
  return <section className="panel protocol-contracts"><div className="panel-h"><h3>Contracts</h3><span className="eyebrow">Robinhood Chain · chain 4663</span></div><div className="contracts"><div><span>Network</span><b>Robinhood Chain</b><small>Chain ID 4663</small></div><div><span>WARROOM Game</span><b>{CONTRACTS.game === '0x0000000000000000000000000000000000000000' ? 'Awaiting deployment' : shortAddress(CONTRACTS.game)}</b>{CONTRACTS.game !== '0x0000000000000000000000000000000000000000' && <a href={`${EXPLORER}/address/${CONTRACTS.game}`} target="_blank" rel="noreferrer">Explorer <ExternalLink size={11} /></a>}</div><div><span>Reward asset</span><b>Tokenized PLTR</b><a href={`${EXPLORER}/token/${CONTRACTS.pltr}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.pltr)} <ExternalLink size={11} /></a></div><div><span>Creator Fees</span><b>Pons V2 Fee Escrow</b><a href={`${EXPLORER}/address/${CONTRACTS.ponsFeeEscrow}`} target="_blank" rel="noreferrer">{shortAddress(CONTRACTS.ponsFeeEscrow)} <ExternalLink size={11} /></a></div></div><div className="panel-b contract-warning"><div className="notice">Verify the game and token addresses in the Robinhood Chain explorer before signing a transaction.</div></div></section>
}

function MintModal({ state, quantity, setQuantity, onClose, onMint }: { state: State; quantity: number; setQuantity: (value: number) => void; onClose: () => void; onMint: () => Promise<void> }) {
  const remaining = state.maxSupply - state.minted
  const maxQuantity = Math.max(1, Math.min(25, remaining))
  const cost = MINT_PRICE * BigInt(quantity)
  const transactionsEnabled = isConfigured || state.demo
  const canMint = transactionsEnabled && remaining > 0 && state.connected && state.warBalance >= cost && !state.pendingAction
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="modal-l" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="mint-title"><div className="modal-h"><h3 id="mint-title">{state.commanders.length ? 'Mint more Commanders' : 'Mint a Commander'}</h3><button className="btn btn-sm" onClick={onClose}>ESC</button></div><div className="modal-b"><div className="nftcard"><div className="body"><CommanderGlyph id={BigInt(state.minted + 1)} size={54} /><div><div className="eyebrow">Commander NFT · a separate character</div><div className="nft-title">Your pass into the game</div><p>The token is the character: rank, missile level, hits, damage and credited rewards all live on it. Every Commander progresses separately.</p></div></div></div><div className="eyebrow modal-label">How many</div><div className="qty"><button disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><div className="n">{quantity}<small>{quantity > 1 ? 'separate characters' : 'commander'}</small></div><button disabled={quantity >= maxQuantity} onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}>+</button></div><div className="presets">{[1, 2, 5, 10].map((value) => <button className={quantity === value ? 'on' : ''} disabled={value > maxQuantity} onClick={() => setQuantity(value)} key={value}>{value}</button>)}<button disabled={maxQuantity <= 1} onClick={() => setQuantity(maxQuantity)}>Max {maxQuantity}</button></div><div className="modal-supply"><div><span className="eyebrow">Supply</span><span className="num">{state.minted.toLocaleString()} / {state.maxSupply.toLocaleString()} minted</span></div><div className="bar"><i style={{ transform: `scaleX(${state.minted / state.maxSupply})` }} /></div><div className="eyebrow">{remaining.toLocaleString()} left. There will never be more than {state.maxSupply.toLocaleString()}.</div></div><div className="ledger modal-ledger"><div><span>Wallet balance</span><span className="amb">{token(state.warBalance)} WAR</span></div><div><span>Price each</span><span>100,000 WAR</span></div><div><span>{quantity} × 100,000</span><span>{shortToken(cost)} WAR</span></div><div className="burn"><span>Burned on mint</span><span>{shortToken(cost / 2n)} WAR · 50%</span></div><div><span>Treasury, economy and rewards</span><span>{shortToken(cost / 2n)} WAR</span></div><div><span>Each starts as</span><span>Recruit · Missile Level 1</span></div><div><span>Per wallet</span><span>No limit</span></div></div>{!transactionsEnabled && <p className="modal-note">The WARROOM contract has not been deployed. No transaction will be created.</p>}</div><div className="modal-f"><button className={`btn btn-lg btn-block ${canMint ? 'btn-amber' : ''}`} disabled={!canMint} onClick={() => void onMint()}>{!transactionsEnabled ? 'Awaiting contract deployment' : remaining <= 0 ? 'Sold out' : state.warBalance < cost ? `Not enough WAR — need ${shortToken(cost)}` : `Mint ${quantity} Commander${quantity > 1 ? 's' : ''} — ${shortToken(cost)} WAR`}</button><div className="eyebrow">One transaction. Each token needs its own launch every round to earn.</div></div></section></div>
}

function RosterModal({ state, selected, onClose, onSelect, onMint, onClaimAll, onRevoke }: { state: State; selected?: Commander; onClose: () => void; onSelect: (id: bigint) => void; onMint: () => void; onClaimAll: () => Promise<unknown>; onRevoke: () => Promise<unknown> }) {
  const pending = Object.values(state.claimableByCommander).reduce((sum, value) => sum + value, 0n)
  const weight = state.commanders.reduce((sum, commander) => sum + (commander.activeRound === state.round.id ? RANKS[commander.rank].multiplier : 0n), 0n)
  useEffect(() => { const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="modal-l" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="roster-title"><div className="modal-h"><h3 id="roster-title">Select Commander</h3><button className="btn btn-sm" onClick={onClose}>ESC</button></div><div className="modal-b"><p className="roster-intro">This wallet holds <b>{state.commanders.length}</b> of the {state.maxSupply.toLocaleString()} Commanders. Each is a separate character with its own rank, missile, hits and credited rewards.</p><div className="rost-list">{state.commanders.length ? state.commanders.map((commander) => <button className={`rost ${selected?.id === commander.id ? 'on' : ''}`} onClick={() => onSelect(commander.id)} key={commander.id.toString()}><CommanderGlyph id={commander.id} size={30} /><span><span className="rk">{RANKS[commander.rank].name}</span><span className="meta">#{commander.id} · Level {commander.missileLevel} · {commander.hits} hits · {commander.totalDamage.toLocaleString()} damage{commander.activeRound === state.round.id ? ' · in this round' : ''}</span></span><span className="due">{(state.claimableByCommander[commander.id.toString()] ?? 0n) > 0n ? `${token(state.claimableByCommander[commander.id.toString()])} PLTR` : '—'}</span><span className="eyebrow">{selected?.id === commander.id ? 'Playing' : 'Play as'}</span></button>) : <div className="roster-empty"><Shield size={34} /><p>No Commander NFTs found on this wallet.</p></div>}</div><div className="ledger modal-ledger"><div><span>Commanders held</span><span>{state.commanders.length}</span></div><div><span>Combined weight this round</span><span>{Number(weight) / 100}×</span></div><div><span>Credited across the wallet</span><span className="amb">{token(pending)} PLTR</span></div></div>{!state.demo && state.allowance > 0n && <button className="btn btn-block revoke-button" disabled={Boolean(state.pendingAction)} onClick={() => void onRevoke()}>Revoke WAR spending approval</button>}</div><div className="modal-f"><div className="modal-actions"><button className={`btn btn-block ${pending > 0n ? 'btn-fed' : ''}`} disabled={pending === 0n || Boolean(state.pendingAction)} onClick={() => void onClaimAll()}>Claim everything</button><button className="btn btn-block btn-amber" disabled={state.minted >= state.maxSupply} onClick={onMint}>Mint another</button></div><div className="eyebrow">No limit per wallet. {(state.maxSupply - state.minted).toLocaleString()} of {state.maxSupply.toLocaleString()} still unminted.</div></div></section></div>
}
