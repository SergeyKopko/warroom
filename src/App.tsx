import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
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
import { BattlePlot, type BattlePlotHandle } from './BattlePlot'
import { DocsPage } from './DocsPage'
import { CONTRACTS, EXPLORER, EXTRA_SHOT_PRICE, FREE_SHOT_COOLDOWN, MINT_PRICE, MISSILES, RANKS, isConfigured } from './config'
import type { Activity, Commander, Screen } from './types'
import { useWarroom } from './useWarroom'

const PAIR = 'WAR / PLTR'
const X_URL = 'https://x.com'

type View = Screen | 'landing'

const navigation: Array<{ id: Screen; label: string }> = [
  { id: 'battle', label: 'Play' },
  { id: 'arsenal', label: 'Upgrade' },
  { id: 'rank', label: 'Rank' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'activity', label: 'Activity' },
  { id: 'docs', label: 'Docs' },
]

const WAR_MARKET = 'https://gmgn.ai/robinhood/token/0x48a9e2ec1ead16c709e1187ac13e7434f9b21a16'

function XIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" /></svg>
}

function HeadLinks({ compact = false, onMint }: { compact?: boolean; onMint?: () => void }) {
  return <>
    {onMint && <button className="hbtn" onClick={onMint} title="Mint more Commanders">+ Commander</button>}
    <a className="hbtn amb" href={WAR_MARKET} target="_blank" rel="noreferrer">Buy WAR{compact ? '' : ' with PLTR'}</a>
    <a className="hbtn ico" href={X_URL} target="_blank" rel="noreferrer" title="Warroom on X"><XIcon /></a>
  </>
}

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
      case 'docs': return <DocsPage contracts={<ProtocolContracts />} />
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
              <button className="wallet" onClick={() => state.connected ? setRosterOpen(true) : enter()} title="Select commander">
                {selected ? <CommanderGlyph id={selected.id} size={16} /> : <Wallet size={15} />}
                <span>{selected ? `#${selected.id}` : state.connected ? shortAddress(state.address) : 'Connect'}</span>
                {selected && <span className="dim">{RANKS[selected.rank].name}</span>}
                {state.commanders.length > 1 && <span className="cnt">{state.commanders.length}</span>}
                <span className="dim">·</span><span className="amb num">{shortToken(state.walletWarBalance ?? state.warBalance)} WAR</span>
                {state.claimable > 0n && <><span className="dim">·</span><span className="fed num">{token(state.claimable)} PLTR</span></>}
              </button>
              <HeadLinks compact onMint={openMint} />
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
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const ticker = [
    ['Active commanders', state.round.totalWeight.toLocaleString()],
    ['Launches', state.totalLaunches.toLocaleString()],
    ['WAR burned', shortToken(state.totalBurned)],
    ['Rewards pool', `${token(state.creatorFees)} PLTR`],
    ['General seats', `${state.rankPopulation?.[4] || 0} / 10`],
    ['Commanders minted', `${state.minted.toLocaleString()} / ${state.maxSupply.toLocaleString()}`],
    ['Pair', PAIR],
  ]
  const stats = [
    ['Enemy integrity', `${integrity.toFixed(1)}%`],
    ['WAR burned', shortToken(state.totalBurned)],
    ['Rewards pool', `${token(state.creatorFees)} PLTR`],
    ['Active commanders', state.round.totalWeight.toLocaleString()],
    ['General seats', `${state.rankPopulation?.[4] || 0} / 10`],
    ['Commanders minted', `${state.minted.toLocaleString()} / ${state.maxSupply.toLocaleString()}`],
  ]
  return <>
    <div className="classbar"><span>Warroom · Robinhood Chain · chain 4663 · pair {PAIR}</span><span>{state.demo ? 'Prototype build — simulated data' : !isConfigured ? 'Awaiting game deployment' : `Round #${state.round.id} · ${countdown(state.round.endsAt, tick)}`}</span></div>
    <div className="landhead">
      <Brand compact onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <div className="r">
        {selected ? <>
          <button className="wallet" onClick={onRoster} title="Select commander">
            <CommanderGlyph id={selected.id} size={16} />
            <span>#{selected.id}</span>
            <span className="dim">{RANKS[selected.rank].name}</span>
            {state.commanders.length > 1 && <span className="cnt">{state.commanders.length}</span>}
            <span className="dim">·</span>
            <span className="amb num">{shortToken(state.walletWarBalance ?? state.warBalance)} WAR</span>
          </button>
          <button className="hbtn amb" onClick={onEnter}>Enter Warroom</button>
        </> : <button className="hbtn" onClick={onDocs}>Docs</button>}
        <HeadLinks onMint={state.connected ? onMint : undefined} />
      </div>
    </div>
    <main id="main-content">
      <section className="hero">
        <div className="hero-in">
          <div className="eyebrow" style={{ marginBottom: 26 }}>Strategic operations interface</div>
          <h1>WAR<span>ROOM</span></h1>
          <p className="sub">Spend WAR to play. Earn PLTR as rewards.</p>
          <p className="hero-copy">One target, twelve hundred commanders and ten General seats. Every upgrade burns WAR; every round pays out in tokenized PLTR.</p>
          <div className="cta">
            <button className="btn btn-lg btn-amber" onClick={onEnter}>{selected ? 'Enter Warroom' : state.connected ? 'Mint a Commander' : 'Connect wallet'}</button>
            <button className="btn btn-lg" onClick={onDocs}>Read the docs</button>
            <span className="eyebrow">{selected
              ? `${state.commanders.length} commander${state.commanders.length > 1 ? 's' : ''} on this wallet · playing as #${selected.id}`
              : `Robinhood Chain · MetaMask, WalletConnect · pair ${PAIR}`}</span>
          </div>
        </div>
      </section>
      <div className="marquee"><div>{[...ticker, ...ticker].map(([key, value], index) => <span key={`${key}-${index}`}>{key} <b>{value}</b><i>·</i></span>)}</div></div>
      <div className="page landing-page">
        <EnemyPanel state={state} />
        <div className="warlayout landing-board">
          <BattlePlot integrity={integrity} legend="landing" />
          <Feed items={state.activity} tick={tick} maxHeight={420} />
        </div>
        <div className="stepline">
          {[
            ['Step 1', 'Mint a Commander', '100,000 WAR, half burned. Hold as many as you like — 1,200 exist in total.'],
            ['Step 2', 'Launch', 'One free launch every four hours at the shared target.'],
            ['Step 3', 'Upgrade and rank up', 'Earn a rank with hits, or buy it outright with WAR.'],
            ['Step 4', 'Collect PLTR', 'A round closes every five hours and credits your NFT in tokenized PLTR.'],
          ].map(([number, title, copy]) => <div className="st" key={number}><div className="n">{number}</div><div className="t">{title}</div><p>{copy}</p></div>)}
        </div>
        <div className="statgrid">
          {stats.map(([key, value]) => <div className="stat" key={key}><div className="k">{key}</div><div className="v num">{value}</div></div>)}
        </div>
        <ProtocolContracts />
        <div className="notice legal">Reward distributions are protocol AMM fees redistributed between NFTs and settled in tokenized PLTR. They are not dividends and confer no equity, ownership or shareholder rights; mechanically the payout is identical to a liquidity provider collecting fees on Uniswap. The enemy, its territory and all hardware are fictional. Nothing here is financial, investment, legal or tax advice.</div>
        <footer className="foot"><span>Warroom — visual prototype · <button onClick={onDocs}>Docs and FAQ</button></span><span>Robinhood Chain · pair {PAIR} · rewards in tokenized PLTR</span></footer>
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

function Feed({ items, tick, maxHeight }: { items: Activity[]; tick: number; maxHeight?: number }) {
  return <section className="panel feed-panel"><div className="panel-h"><h3>Activity</h3><span className="eyebrow">Live</span></div><div className="feed" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>{items.slice(0, 14).map((item) => <div className={`fitem ${item.mine ? 'me' : ''}`} key={item.id}><span className="ts">{relativeTime(item.timestamp, tick)}</span><div className="bd"><b>{item.title}</b><span>{item.detail}</span></div></div>)}</div></section>
}

function EmptyGate({ onMint }: { onMint: () => void }) {
  return <section className="panel empty-gate"><Radar size={40} /><h2>Commander required</h2><p>Mint the NFT that carries your rank, launcher level and battle history.</p><button className="btn btn-lg btn-amber" onClick={onMint}>Mint Commander</button></section>
}

function PlayPage({ state, selected, tick, onLaunch, onMint, onRoster }: { state: State; selected?: Commander; tick: number; onLaunch: (paid: boolean) => Promise<{ hit: boolean; damage: bigint } | void>; onMint: () => void; onRoster: () => void }) {
  const plotRef = useRef<BattlePlotHandle>(null)
  const [strike, setStrike] = useState<{ hit: boolean; damage: bigint; at: number }>()
  if (!selected) return <div className="page"><EnemyPanel state={state} /><EmptyGate onMint={onMint} /></div>
  const missile = MISSILES[selected.missileLevel - 1]
  const rank = RANKS[selected.rank]
  const next = selected.rank < 4 ? RANKS[selected.rank + 1] : undefined
  const cooldown = Math.max(0, selected.lastLaunchAt + FREE_SHOT_COOLDOWN - tick)
  const today = Math.floor(tick / 86_400)
  const extras = selected.extraDay === today ? selected.extraCount : 0
  const integrity = Number(state.targetHp * 10_000n / state.targetMaxHp) / 100
  const combinedWeight = state.commanders.reduce((sum, commander) => sum + (commander.activeRound === state.round.id ? RANKS[commander.rank].multiplier : 0n), 0n)
  const fire = async (paid: boolean) => {
    try {
      const result = await onLaunch(paid)
      if (result) {
        plotRef.current?.launch(true, result.hit, selected.missileLevel)
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
        <BattlePlot ref={plotRef} integrity={integrity} legend="battle" caption={state.demo ? 'DEMO SPEED · LOCAL SIMULATION' : 'ROBINHOOD CHAIN · BLOCK FINALITY'} />
        <div className="bigfire">
          <button className="launch" disabled={cooldown > 0 || Boolean(state.pendingAction)} onClick={() => void fire(false)}>{cooldown ? 'Reloading' : 'Launch'}<span className="cd">{cooldown ? `next launch in ${countdown(selected.lastLaunchAt + FREE_SHOT_COOLDOWN, tick)}` : `Level ${missile.level} · ${missile.damage.toLocaleString()} damage · 70% hit`}</span></button>
          <button className="btn btn-amber paid-launch" disabled={extras >= 3 || state.warBalance < EXTRA_SHOT_PRICE || Boolean(state.pendingAction)} onClick={() => void fire(true)}>Launch now<span>10,000 WAR · {3 - extras} left today</span></button>
        </div>
        <div className="hero-row">
          <div className="cell"><div className="k">Your missile</div><div className="v">Level {missile.level}</div><div className="s">{missile.damage.toLocaleString()} damage per hit</div></div>
          <div className="cell"><div className="k">Commander #{selected.id}</div><div className="v">{rank.name}</div><div className="s">{next ? (next.hits ? `${selected.hits} / ${next.hits} hits to ${next.name}` : 'General is taken by trial') : 'top rank'}</div></div>
          <div className="cell"><div className="k">This round</div><div className="v num" style={{ fontSize: 21 }}>{token(projected)} PLTR</div><div className="s">{selected.activeRound === state.round.id ? `round #${state.round.id} closes in ` : `launch once to enter round #${state.round.id} · `}{countdown(state.round.endsAt, tick)}</div></div>
          <div className="cell"><div className="k">Your damage</div><div className="v num">{selected.totalDamage.toLocaleString()}</div><div className="s">{selected.hits} hits of {selected.launches} launches</div></div>
        </div>
        <section className="panel commander-summary"><div><span className="eyebrow">Commanders on this wallet</span><b>{state.commanders.length} held{state.commanders.length > 1 ? ` · combined weight ${(Number(combinedWeight) / 100).toFixed(1)}x this round` : ''}</b><p>Every Commander is a separate character with its own rank and its own share of the pool. {state.maxSupply - state.minted} of {state.maxSupply} are still unminted.</p></div><div>{state.commanders.length > 1 && <button className="btn" onClick={onRoster}>Switch commander</button>}<button className="btn btn-amber" onClick={onMint} disabled={state.minted >= state.maxSupply}>{state.minted >= state.maxSupply ? 'Sold out' : 'Mint more'}</button></div></section>
        {selected.activeRound !== state.round.id && selected.launches > 0 && <div className="notice page-notice">You are not in round #{state.round.id}. One launch since the last round closed is all it takes to be counted.</div>}
        <section className="panel damage-board"><div className="panel-h"><h3>Top damage</h3><span className="eyebrow">Commanders on this wallet</span></div><table><thead><tr><th className="rk">#</th><th>Commander</th><th>Missile</th><th className="right">Damage</th></tr></thead><tbody>{[...state.commanders].sort((a, b) => Number(b.totalDamage - a.totalDamage)).slice(0, 10).map((commander, index) => <tr className={commander.id === selected.id ? 'me' : ''} key={commander.id.toString()}><td className={`rk ${index < 3 ? 'top' : ''}`}>{String(index + 1).padStart(2, '0')}</td><td><div className="cmdr"><CommanderGlyph id={commander.id} size={22} /><div><b>{commander.id === selected.id ? 'YOU' : `COMMANDER #${commander.id}`}</b><div className="eyebrow">#{commander.id}</div></div></div></td><td className="dim">Level {commander.missileLevel}</td><td className="num right">{commander.totalDamage.toLocaleString()}</td></tr>)}</tbody></table></section>
      </div>
      <Feed items={state.activity} tick={tick} />
    </div>
  </div>
}

function PageHead({ title, copy, tag }: { title: string; copy: string; tag?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{copy}</p></div>{tag}</div>
}

function UpgradePage({ state, selected, onUpgrade, onMint }: { state: State; selected?: Commander; onUpgrade: () => Promise<unknown>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Upgrade" copy="Missile level decides how much damage each hit does." /><EmptyGate onMint={onMint} /></div>
  return <div className="page">
    <PageHead title="Upgrade" copy="Missile level decides how much damage a hit does. Nothing else. Half of every upgrade fee is burned." tag={<span className="tag tag-amb">{selected.hits} SUCCESSFUL HITS</span>} />
    <div className="grid4">{MISSILES.map((missile) => {
      const owned = selected.missileLevel === missile.level
      const past = selected.missileLevel > missile.level
      const sequential = selected.missileLevel + 1 === missile.level
      const hitsReady = selected.hits >= missile.hits
      const canUpgrade = sequential && hitsReady && state.warBalance >= missile.cost
      return <section className={`mcard ${owned ? 'owned' : ''} ${!owned && !past && !canUpgrade ? 'locked' : ''}`} key={missile.level}>
        <div className="top"><div><div className="tier">LEVEL {missile.level}</div><div className="nm">{missile.damage.toLocaleString()}<span> DMG</span></div></div>{owned ? <span className="tag tag-fed">Equipped</span> : past ? <span className="tag tag-off">Passed</span> : null}</div>
        <div className="silo" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 11 + missile.level * 17) % 8) * 4 + missile.level * 7}%` }} />)}</div>
        <div className="foot">{owned ? <span className="eyebrow">Currently equipped</span> : past ? <span className="eyebrow">Superseded</span> : <><div className="ledger"><div><span>Requires</span><span className={hitsReady ? '' : 'rep'}>{missile.hits} hits</span></div><div><span>Cost</span><span>{shortToken(missile.cost)} WAR</span></div><div className="burn"><span>Burned</span><span>{shortToken(missile.cost / 2n)} WAR</span></div></div>{sequential && !hitsReady && <><div className="bar upgrade-progress"><i style={{ transform: `scaleX(${Math.min(1, selected.hits / missile.hits).toFixed(4)})` }} /></div><div className="eyebrow upgrade-progress-label">{selected.hits} / {missile.hits} hits</div></>}<button className={`btn btn-block ${canUpgrade ? 'btn-fed' : ''}`} disabled={!canUpgrade || Boolean(state.pendingAction)} onClick={() => void onUpgrade()}>{!sequential ? 'Upgrade in order' : !hitsReady ? `${missile.hits - selected.hits} more hits` : state.warBalance < missile.cost ? 'Not enough WAR' : 'Upgrade'}</button></>}</div>
      </section>
    })}</div>
    <div className="notice page-notice">Missile level is power. Rank is reward. The two never mix.</div>
  </div>
}

function RankPage({ state, selected, onRankUp, onMint }: { state: State; selected?: Commander; onRankUp: (purchased: boolean) => Promise<unknown>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Rank" copy="Rank multiplies your share of every reward round." /><EmptyGate onMint={onMint} /></div>
  const ageDays = Math.floor((Date.now() / 1000 - selected.mintedAt) / 86_400)
  return <div className="page">
    <PageHead title="Rank" copy="Rank does one thing: it multiplies your share of the rewards. You can earn a rank with hits and time, or buy it outright with WAR — except General, which is only ever taken by trial." tag={<span className="tag tag-amb">Your rank gives you {Number(RANKS[selected.rank].multiplier) / 100}x rewards</span>} />
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
        <div><h4>{rank.name}{index === 4 && <span className="eyebrow"> — trial only, even when a seat is empty</span>}</h4><div className="req">{index === 0 ? 'Issued at mint' : index === 4 ? 'Ten seats in the whole game. A Colonel takes one by entering the General trial.' : `${rank.hits} successful hits · ${rank.days} day${rank.days > 1 ? 's' : ''} · ${shortToken(rank.earned)} WAR`}</div>{rank.seats !== null && <><div className="seats">{Array.from({ length: rank.seats }, (_, seat) => <i className={seat < (state.rankPopulation[index] || 0) ? 'taken' : 'free'} key={seat} />)}</div><div className="eyebrow seat-copy">{state.rankPopulation[index] || 0} / {rank.seats} seats occupied{full ? ' — full' : ''}</div></>}{next && index < 4 && !hitsReady && <><div className="bar rank-progress"><i style={{ transform: `scaleX(${Math.min(1, selected.hits / rank.hits).toFixed(4)})` }} /></div><div className="eyebrow rank-progress-label">{selected.hits} / {rank.hits} hits</div></>}</div>
        <div className="mult"><span>REWARDS</span>{Number(rank.multiplier) / 100}×</div>
        <div className="rank-actions">{done ? <span className="tag tag-off">Passed</span> : current ? <span className="tag tag-amb">Current</span> : index === 4 ? <button className={`btn btn-sm btn-block ${trialReady ? 'btn-amber' : ''}`} disabled={!trialReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!next ? 'Colonels only' : full ? 'Seats full' : state.warBalance < 800_000n * 10n ** 18n ? 'Not enough WAR' : 'Enter trial · 800K WAR'}</button> : next ? <><button className={`btn btn-sm btn-block ${earnedReady ? 'btn-fed' : ''}`} disabled={!earnedReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{!hitsReady ? `${rank.hits - selected.hits} more hits` : !ageReady ? `${rank.days - ageDays}d to wait` : state.warBalance < rank.earned ? 'Not enough WAR' : `Earn it · ${shortToken(rank.earned)} WAR`}</button><button className={`btn btn-sm btn-block ${buyReady ? 'btn-amber' : ''}`} disabled={!buyReady || Boolean(state.pendingAction)} onClick={() => void onRankUp(true)}>Buy rank · {shortToken(rank.buy)} WAR</button></> : <span className="tag tag-off">Locked</span>}</div>
      </div>
    })}</div>
    <div className="grid2 rank-explain">
      <section className="panel"><div className="panel-h"><h3>Earn it</h3></div><div className="panel-b"><p>Land the hits, serve the days, pay the promotion fee. Slower, but your file stays clean and the next rung costs what it says on the ladder.</p><div className="ledger"><div><span>Captain</span><span>10 hits · 1 day · 100,000 WAR</span></div><div><span>Major</span><span>30 hits · 3 days · 300,000 WAR</span></div><div><span>Colonel</span><span>75 hits · 7 days · 900,000 WAR</span></div></div></div></section>
      <section className="panel"><div className="panel-h"><h3>Buy it</h3><span className="tag tag-amb">From day one</span></div><div className="panel-b"><p>Skip the hits and the wait entirely. Ranks are bought one step at a time. General is the exception — no amount of WAR buys a chair.</p><div className="ledger"><div><span>Captain</span><span>250,000 WAR</span></div><div><span>Major</span><span>750,000 WAR</span></div><div><span>Colonel</span><span>2,250,000 WAR</span></div><div className="burn"><span>Burned on purchase</span><span>50%</span></div></div><div className="eyebrow" style={{ marginTop: 11 }}>General is the exception. No amount of WAR buys a chair.</div></div></section>
    </div>
    <section className="panel generals-board" id="generals">
      <div className="panel-h"><h3>The ten Generals</h3><span className="eyebrow">{state.rankPopulation?.[4] || 0} of 10 seats held · trial 800,000 WAR</span></div>
      {Array.from({ length: 10 }, (_, index) => {
        const held = state.rankPopulation?.[4] || 0
        const occupied = index < held
        const firstOpen = index === held && held < 10
        const canTrial = selected.rank === 3 && firstOpen && state.warBalance >= 800_000n * 10n ** 18n
        return <div className="gen-row" key={index}>
          <div className="slot">#{String(index + 1).padStart(2, '0')}</div>
          <div className="cmdr">{occupied ? <CommanderGlyph id={BigInt(900 + index)} size={22} /> : <span className="av vacant" />}<div><div className={`seat-name ${occupied ? '' : 'dim'}`}>{occupied ? 'Seat held' : 'Vacant seat'}</div><div className="eyebrow">{occupied ? 'General on duty' : 'No one holds it'}</div></div></div>
          <div><div className="eyebrow">Status</div><div className="num seat-status">{occupied ? 'Held' : 'Open'}</div></div>
          <div className="seat-action">{occupied ? <span className="tag tag-off">Occupied</span> : firstOpen ? <button className={`btn btn-sm ${canTrial ? 'btn-amber' : ''}`} disabled={!canTrial || Boolean(state.pendingAction)} onClick={() => void onRankUp(false)}>{selected.rank !== 3 ? 'Colonels only' : held >= 10 ? 'Seats full' : state.warBalance < 800_000n * 10n ** 18n ? 'Deposit too high' : 'Enter trial'}</button> : <span className="tag tag-off">Open</span>}</div>
        </div>
      })}
    </section>
    {selected.activeRound === state.round.id && <div className="notice page-notice">Commander #{selected.id} entered round #{state.round.id} at {Number(RANKS[selected.rank].multiplier) / 100}×. A later promotion applies to the next reward round because the current weight is already recorded on-chain.</div>}
  </div>
}

function RewardsPage({ state, selected, tick, onClaim, onClaimAll, onClose, onLaunch, onMint }: { state: State; selected?: Commander; tick: number; onClaim: () => Promise<unknown>; onClaimAll: () => Promise<unknown>; onClose: () => Promise<unknown>; onLaunch: () => Promise<unknown>; onMint: () => void }) {
  if (!selected) return <div className="page"><PageHead title="Rewards" copy="A share of the trading fees the protocol collects flows into the rewards contract." /><EmptyGate onMint={onMint} /></div>
  const active = selected.activeRound === state.round.id
  const rank = RANKS[selected.rank]
  const totalClaimable = Object.values(state.claimableByCommander).reduce((sum, value) => sum + value, 0n)
  const selectedClaimable = state.claimableByCommander[selected.id.toString()] ?? state.claimable
  const pool = state.creatorFees
  const clerkFee = pool * 5n / 1000n
  const roundReward = pool - clerkFee
  const myWeight = active ? rank.multiplier : 0n
  const estimated = active && state.round.totalWeight > 0n ? roundReward * rank.multiplier / state.round.totalWeight : 0n
  const combinedWeight = state.commanders.reduce((sum, commander) => sum + (commander.activeRound === state.round.id ? RANKS[commander.rank].multiplier : 0n), 0n)
  const combinedShare = state.round.totalWeight > 0n ? roundReward * combinedWeight / state.round.totalWeight : 0n
  const othersWeight = state.round.totalWeight > myWeight ? state.round.totalWeight - myWeight : 0n
  const closable = tick >= state.round.endsAt
  const creditedRounds = state.roundHistory.filter((history) => history.commanderWeight > 0n).length
  return <div className="page">
    <PageHead
      title="Rewards"
      copy="A share of the trading fees the protocol collects flows into the rewards contract. Every 5 hours a round closes, a snapshot is taken, and each commander's share is credited to their NFT. Nothing is sent automatically — you claim when you want, and everything credited since your last claim comes out in one transaction."
      tag={<span className={`tag ${active ? 'tag-fed' : 'tag-rep'}`}>{active ? "In this round's snapshot" : 'Not in the snapshot — launch to qualify'}</span>}
    />
    <div className="grid2 rewards-grid">
      <section className="panel objective">
        <div className="panel-h" style={{ background: 'rgba(255,176,32,.1)', borderBottomColor: 'var(--amber)' }}>
          <h3 style={{ color: 'var(--amber)' }}>Available to claim</h3>
          <span className="eyebrow">{creditedRounds} credited rounds</span>
        </div>
        <div className="panel-b">
          <div className="rewards-claim">
            <div className="reward-number">{token(selectedClaimable)}</div>
            <p>Sitting in the rewards contract, waiting for you</p>
            <button className={`btn btn-lg btn-block ${selectedClaimable > 0n ? 'btn-amber' : ''}`} disabled={selectedClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaim()}>
              {selectedClaimable > 0n ? `Claim ${token(selectedClaimable)} for #${selected.id}` : 'Nothing to claim yet'}
            </button>
            {state.commanders.length > 1 && (
              <button className={`btn btn-block ${totalClaimable > 0n ? 'btn-fed' : ''}`} style={{ marginTop: 10 }} disabled={totalClaimable === 0n || Boolean(state.pendingAction)} onClick={() => void onClaimAll()}>
                Claim {token(totalClaimable)} across all {state.commanders.length} commanders
              </button>
            )}
          </div>
          <div className="ledger" style={{ marginTop: 14 }}>
            <div><span>Wallet PLTR balance</span><span>{token(state.pltrBalance)}</span></div>
            <div><span>Available for #{selected.id}</span><span className="amb">{token(selectedClaimable)}</span></div>
            {state.commanders.length > 1 && <div><span>Available across the wallet</span><span className="fed">{token(totalClaimable)}</span></div>}
          </div>
          <div className="eyebrow reward-history-note">Rounds you miss are simply not credited. Nothing you have earned ever expires.</div>
          <div className="pltr-explain">
            <div className="eyebrow">What PLTR is doing here</div>
            <p>WAR is the fuel: you spend it to mint, to upgrade, to buy rank and to contest a seat, and half of it burns. Rewards come back in a different asset entirely — tokenized PLTR — so the token you spend is never the token being handed out. WAR only ever leaves circulation.</p>
            <div className="ledger">
              <div><span>Spend to play</span><span>WAR</span></div>
              <div><span>Earn as rewards</span><span className="amb">Tokenized PLTR</span></div>
              <div><span>Market pair</span><span>{PAIR}</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`panel ${closable ? 'objective' : ''}`}>
        <div className="panel-h">
          <h3>Round #{state.round.id}</h3>
          <span className={`tag ${closable ? 'tag-amb' : 'tag-off'}`}>{closable ? 'Ready to close' : `Closes in ${countdown(state.round.endsAt, tick)}`}</span>
        </div>
        <div className="panel-b">
          {closable && (
            <>
              <div className="notice" style={{ marginBottom: 14 }}>The timer has run out and nobody has triggered the round yet. Whoever sends the transaction keeps 0.5% of the pool — {token(clerkFee)} — on top of their own share.</div>
              <button className="btn btn-lg btn-block btn-amber" style={{ marginBottom: 14 }} disabled={Boolean(state.pendingAction)} onClick={() => void onClose()}>Close round {state.round.id} and keep {token(clerkFee)}</button>
            </>
          )}
          {!closable && !active && (
            <button className="btn btn-block btn-fed" style={{ marginBottom: 14 }} disabled={Boolean(state.pendingAction)} onClick={() => void onLaunch()}>Launch once to enter this round</button>
          )}
          <div className="ledger round-ledger">
            <div><span>Pool for this round</span><span className="amb">{token(pool)}</span></div>
            <div><span>Clerk fee — 0.5% to whoever closes it</span><span>{token(clerkFee)}</span></div>
            <div><span>Collected from fees</span><span>{token(pool)}</span></div>
            <div><span>Weight of everyone else</span><span>{(Number(othersWeight) / 100).toLocaleString()}</span></div>
            <div><span>Your rank</span><span>{rank.name} · {(Number(rank.multiplier) / 100).toFixed(1)}x</span></div>
            <div><span>Weight of #{selected.id} this round</span><span className={myWeight ? 'amb' : 'rep'}>{(Number(myWeight) / 100).toFixed(1)}{myWeight ? '' : ' — no launch since the last close'}</span></div>
            <div><span>Share of #{selected.id} if it closed now</span><span className="amb">{token(estimated)}</span></div>
            {state.commanders.length > 1 && <>
              <div><span>Combined weight of your {state.commanders.length} commanders</span><span>{(Number(combinedWeight) / 100).toFixed(1)}x</span></div>
              <div><span>Combined share if it closed now</span><span className="amb">{token(combinedShare)}</span></div>
            </>}
          </div>
          <div className="stepline vertical">
            {[
              ['Trading volume', 'WAR changes hands on the AMM'],
              ['Reward fees', 'A share of every trading fee lands in the contract'],
              ['Round closes every 5h', 'Anyone can trigger it and keep 0.5% of the pool'],
              ['Credited to your NFT', 'Claim it whenever you like'],
            ].map(([title, copy], index) => (
              <div className="st" key={title}>
                <div className="n">STEP {index + 1}</div>
                <div className="t">{title}</div>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>

    {state.commanders.length > 1 && (
      <section className="panel commander-rewards">
        <div className="panel-h"><h3>Your commanders</h3><span className="eyebrow">Every NFT is settled on its own</span></div>
        <table>
          <thead><tr><th>Commander</th><th>Rank</th><th>Weight</th><th>In this round</th><th className="right">Available</th></tr></thead>
          <tbody>
            {state.commanders.map((commander) => {
              const available = state.claimableByCommander[commander.id.toString()] ?? 0n
              return (
                <tr className={commander.id === selected.id ? 'me' : ''} key={commander.id.toString()}>
                  <td><div className="cmdr"><CommanderGlyph id={commander.id} /><div><div style={{ color: 'var(--ink)' }}>#{commander.id}</div><div className="eyebrow">Level {commander.missileLevel} · {commander.hits} hits</div></div></div></td>
                  <td>{RANKS[commander.rank].name}</td>
                  <td className="num">{(Number(RANKS[commander.rank].multiplier) / 100).toFixed(1)}x</td>
                  <td>{commander.activeRound === state.round.id ? <span className="tag tag-fed">In</span> : <span className="tag tag-off">Out</span>}</td>
                  <td className="num right" style={{ color: available > 0n ? 'var(--fed)' : 'var(--faint)' }}>{available > 0n ? token(available) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    )}

    <section className="panel recent-rounds">
      <div className="panel-h"><h3>Recent rounds</h3><span className="eyebrow">One launch since the previous close puts you in the snapshot</span></div>
      {state.roundHistory.length ? (
        <table>
          <thead><tr><th>Round</th><th>Pool</th><th>Clerk fee</th><th>Your weight</th><th className="right">Credited</th><th className="right">Result</th></tr></thead>
          <tbody>
            {state.roundHistory.map((history) => {
              const tip = history.reward * 5n / 995n
              const share = history.totalWeight > 0n ? history.reward * history.commanderWeight / history.totalWeight : 0n
              const status = history.commanderWeight === 0n ? 'Missed' : share === 0n ? 'Rolled over' : history.claimed ? 'Credited' : 'Credited'
              return (
                <tr key={history.id}>
                  <td className="num">#{history.id}</td>
                  <td className="num">{token(history.reward)}</td>
                  <td className="num dim">{history.reward ? token(tip) : '—'}</td>
                  <td className="num">{history.commanderWeight ? `${(Number(history.commanderWeight) / 100).toFixed(1)}x` : '0.0'}</td>
                  <td className="num right">{share ? token(share) : '—'}</td>
                  <td className="right"><span className={`tag ${status === 'Credited' ? 'tag-fed' : status === 'Rolled over' ? 'tag-amb' : 'tag-off'}`}>{status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="panel-b"><div className="eyebrow empty-rounds">No rounds have closed since you minted. The first one settles when the timer above runs out.</div></div>
      )}
    </section>

    <div className="grid2 rewards-rules">
      <section className="panel">
        <div className="panel-h"><h3>Weights</h3></div>
        <div className="panel-b">
          <div className="ledger">{RANKS.map((item, index) => <div key={item.name}><span>{item.name}</span><span className={index === selected.rank ? 'amb' : ''}>{(Number(item.multiplier) / 100).toFixed(1)}x</span></div>)}</div>
          <p>Your share is your weight divided by the weight of everyone in the snapshot. A General takes four times what a Recruit takes out of the same pool — but out of the same pool, not out of a bigger one.</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><h3>Rules worth knowing</h3></div>
        <div className="panel-b">
          <div className="ledger">
            <div><span>Round length</span><span>5 hours</span></div>
            <div><span>Counts as active</span><span>One launch since the last close</span></div>
            <div><span>Snapshot</span><span>Taken at close — later promotions count next round</span></div>
            <div><span>Empty round</span><span>Whole pool rolls into the next</span></div>
            <div><span>Rounding dust</span><span>Carried, never stuck in the contract</span></div>
            <div><span>Unclaimed rewards</span><span className="amb">Never expire</span></div>
            <div><span>Who closes the round</span><span>Anyone — keeps 0.5% of the pool</span></div>
            <div><span>Commanders per wallet</span><span>No limit</span></div>
            <div><span>Settlement</span><span>Per NFT, not per wallet</span></div>
          </div>
          <div className="notice rewards-rule-notice">No trading volume means no fees and an empty pool. Rank sets the size of your share, it does not create one.</div>
        </div>
      </section>
    </div>

    <section className="panel total-burned">
      <div className="panel-h"><h3>Total WAR burned</h3><span className="eyebrow">Removed from supply permanently</span></div>
      <div className="panel-b">
        <b>{token(state.totalBurned, 18, 0)}</b>
        <span className="eyebrow">Half of every WAR spent in the game is burned</span>
        <p>You have burned {token(selected.warBurned, 18, 0)} WAR</p>
      </div>
    </section>
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

function ProtocolContracts() {
  const rows = [
    { key: 'Game', name: 'WarroomGame', addr: CONTRACTS.game, note: 'Core game logic · launches, ranks, rewards' },
    { key: 'Fuel', name: 'WAR token', addr: CONTRACTS.war, note: 'Spent to play · 50% burned on every action' },
    { key: 'Reward', name: 'Tokenized PLTR', addr: CONTRACTS.pltr, note: 'Creator Fees settle here for claimable rewards' },
  ] as const
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
  }
  return <section className="panel protocol-contracts"><div className="panel-h"><h3>Contracts</h3><span className="eyebrow">Robinhood Chain · chain 4663</span></div>
    <div className="contracts">{rows.map((row) => {
      const pending = row.addr === '0x0000000000000000000000000000000000000000'
      return <div className="ct" key={row.key}><div className="k">{row.key}</div><div className="nm">{row.name}</div>
        <div className={`addr ${pending ? 'pending' : ''}`}><span>{pending ? '0x0000…0000 — not deployed yet' : row.addr}</span>
          {pending ? <button disabled style={{ opacity: .4 }}>Copy</button> : <><button onClick={() => void copy(row.addr)}>Copy</button><a className="addr-link" href={`${EXPLORER}/address/${row.addr}`} target="_blank" rel="noreferrer">Explorer</a></>}
        </div>
        <div className="note">{row.note}</div></div>
    })}</div>
    <div className="panel-b contract-warning"><div className="notice">Addresses are published here the moment the contracts are deployed and verified on the Robinhood Chain explorer. Anything claiming to be WAR before that is not ours.</div></div>
  </section>
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
