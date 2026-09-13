import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'

const W = 1200
const H = 560
const CX = 600
const CY = 285
const ENEMY: Array<[number, number]> = [[600, 155], [700, 190], [745, 265], [720, 350], [640, 405], [545, 400], [478, 340], [462, 255], [510, 185]]
const SILOS: Array<[number, number]> = [[110, 120], [280, 90], [900, 95], [1080, 140], [95, 430], [300, 470], [880, 475], [1090, 420], [140, 275], [1065, 290]]

type Flight = {
  x0: number; y0: number; x1: number; y1: number
  p: number; speed: number; arc: number
  hit: boolean; mine: boolean; stop: number
  trail: Array<[number, number]>
}

type Bloom = { x: number; y: number; r: number; hit: boolean; mine: boolean }

export type BattlePlotHandle = {
  launch: (mine?: boolean, hit?: boolean, level?: number) => void
}

type Props = {
  integrity: number
  legend?: 'landing' | 'battle'
  caption?: string
  reducedMotion?: boolean
}

function bez(f: Flight, p: number): [number, number] {
  const mx = (f.x0 + f.x1) / 2
  const my = Math.min(f.y0, f.y1) - f.arc
  const q = 1 - p
  return [q * q * f.x0 + 2 * q * p * mx + p * p * f.x1, q * q * f.y0 + 2 * q * p * my + p * p * f.y1]
}

export const BattlePlot = forwardRef<BattlePlotHandle, Props>(function BattlePlot({ integrity, legend = 'battle', caption, reducedMotion }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flightsRef = useRef<Flight[]>([])
  const bloomsRef = useRef<Bloom[]>([])
  const sweepRef = useRef(0)
  const shakeRef = useRef(0)
  const fracRef = useRef(Math.max(0, Math.min(1, integrity / 100)))

  useEffect(() => {
    fracRef.current = Math.max(0, Math.min(1, integrity / 100))
  }, [integrity])

  useImperativeHandle(ref, () => ({
    launch(mine = false, hit = true, level = 1) {
      const s = SILOS[Math.floor(Math.random() * SILOS.length)]
      const t = ENEMY[Math.floor(Math.random() * ENEMY.length)]
      const dst: [number, number] = [t[0] + (Math.random() * 40 - 20), t[1] + (Math.random() * 40 - 20)]
      flightsRef.current.push({
        x0: s[0], y0: s[1], x1: dst[0], y1: dst[1],
        p: 0, speed: 0.0058 + level * 0.0006,
        arc: 110 + Math.random() * 80, hit, mine,
        stop: hit ? 1 : 0.72 + Math.random() * 0.12,
        trail: [],
      })
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = W
    canvas.height = H

    const prefersReduced = reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let ambient = 0

    const poly = (points: Array<[number, number]>, stroke: string, fill: string | null, width = 1.4) => {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
      ctx.closePath()
      if (fill) { ctx.fillStyle = fill; ctx.fill() }
      ctx.strokeStyle = stroke
      ctx.lineWidth = width
      ctx.stroke()
    }

    const drawBoard = () => {
      const shake = shakeRef.current
      const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
      const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
      if (shake > 0) shakeRef.current = Math.max(0, shake - 0.4)
      ctx.setTransform(1, 0, 0, 1, sx, sy)
      ctx.fillStyle = '#0E1216'
      ctx.fillRect(-10, -10, W + 20, H + 20)
      ctx.strokeStyle = 'rgba(74,92,103,.15)'
      ctx.lineWidth = 1
      for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      ctx.strokeStyle = 'rgba(240,74,46,.16)'
      for (let r = 140; r <= 560; r += 100) { ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke() }
      if (!prefersReduced) {
        sweepRef.current += 0.005
        if (sweepRef.current > Math.PI * 2) sweepRef.current = 0
      }
      const sweep = sweepRef.current
      const g = ctx.createLinearGradient(CX, CY, CX + Math.cos(sweep) * 620, CY + Math.sin(sweep) * 620)
      g.addColorStop(0, 'rgba(255,176,32,.14)')
      g.addColorStop(1, 'rgba(255,176,32,0)')
      ctx.strokeStyle = g
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + Math.cos(sweep) * 620, CY + Math.sin(sweep) * 620)
      ctx.stroke()
      const frac = fracRef.current
      ctx.setLineDash([9, 7])
      ctx.strokeStyle = `rgba(240,74,46,${0.25 + frac * 0.4})`
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(CX, CY, 175, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      poly(ENEMY, 'rgba(240,74,46,.9)', `rgba(240,74,46,${0.05 + frac * 0.09})`, 1.8)
      ctx.strokeStyle = 'rgba(240,74,46,.5)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(CX, CY, 44, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(CX, CY, 22, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(CX - 58, CY); ctx.lineTo(CX + 58, CY); ctx.moveTo(CX, CY - 58); ctx.lineTo(CX, CY + 58); ctx.stroke()
      ctx.strokeStyle = 'rgba(46,155,255,.55)'
      ctx.fillStyle = 'rgba(46,155,255,.55)'
      SILOS.forEach(([x, y]) => {
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill()
      })
      ctx.font = '400 11px "IBM Plex Mono",monospace'
      ctx.fillStyle = 'rgba(240,74,46,.85)'
      ctx.fillText('GLOBAL ENEMY', CX - 42, 138)
      ctx.fillStyle = 'rgba(74,92,103,.8)'
      ctx.fillText('COMMANDER SILOS', 40, 40)
    }

    const drawFlights = () => {
      const flights = flightsRef.current
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i]
        f.p += f.speed
        const [x, y] = bez(f, Math.min(f.p, f.stop))
        f.trail.push([x, y])
        if (f.trail.length > 44) f.trail.shift()
        ctx.lineWidth = f.mine ? 2.4 : 1.2
        for (let k = 1; k < f.trail.length; k++) {
          ctx.strokeStyle = f.mine
            ? `rgba(255,176,32,${(k / f.trail.length) * 0.95})`
            : `rgba(46,155,255,${(k / f.trail.length) * 0.5})`
          ctx.beginPath()
          ctx.moveTo(f.trail[k - 1][0], f.trail[k - 1][1])
          ctx.lineTo(f.trail[k][0], f.trail[k][1])
          ctx.stroke()
        }
        ctx.fillStyle = f.mine ? '#FFB020' : 'rgba(46,155,255,.95)'
        ctx.beginPath()
        ctx.arc(x, y, f.mine ? 4 : 2.4, 0, Math.PI * 2)
        ctx.fill()
        if (f.p >= f.stop) {
          bloomsRef.current.push({ x, y, r: 0, hit: f.hit, mine: f.mine })
          if (f.hit && f.mine) shakeRef.current = 7
          flights.splice(i, 1)
        }
      }
    }

    const drawBlooms = () => {
      const blooms = bloomsRef.current
      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i]
        b.r += b.hit ? 2.1 : 1.2
        const a = Math.max(0, 1 - b.r / (b.hit ? 58 : 32))
        if (b.hit) {
          ctx.strokeStyle = `rgba(${b.mine ? '255,176,32' : '240,74,46'},${a})`
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke()
          ctx.fillStyle = `rgba(${b.mine ? '255,176,32' : '240,74,46'},${a * 0.15})`
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.strokeStyle = `rgba(124,146,158,${a})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(b.x - b.r, b.y - b.r); ctx.lineTo(b.x + b.r, b.y + b.r)
          ctx.moveTo(b.x + b.r, b.y - b.r); ctx.lineTo(b.x - b.r, b.y + b.r)
          ctx.stroke()
        }
        if (a <= 0) blooms.splice(i, 1)
      }
    }

    const spawnAmbient = () => {
      const s = SILOS[Math.floor(Math.random() * SILOS.length)]
      const t = ENEMY[Math.floor(Math.random() * ENEMY.length)]
      const hit = Math.random() > 0.3
      flightsRef.current.push({
        x0: s[0], y0: s[1],
        x1: t[0] + (Math.random() * 40 - 20),
        y1: t[1] + (Math.random() * 40 - 20),
        p: 0, speed: 0.0058 + Math.random() * 0.0024,
        arc: 110 + Math.random() * 80, hit, mine: false,
        stop: hit ? 1 : 0.72 + Math.random() * 0.12,
        trail: [],
      })
    }

    // Seed a couple of arcs so the board is alive on first paint.
    spawnAmbient()
    spawnAmbient()

    const loop = (now: number) => {
      if (!prefersReduced && now - ambient > 2400) {
        ambient = now
        if (!document.hidden) spawnAmbient()
      }
      drawBoard()
      drawFlights()
      drawBlooms()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  return (
    <div className="plotwrap">
      <canvas id="plot" ref={canvasRef} width={W} height={H} role="img" aria-label={`Live target map. Enemy integrity ${integrity.toFixed(1)} percent.`} />
      <div className="plot-ov" />
      <span className="plot-corner pc-tl">LIVE PLOT · FICTIONAL TARGET</span>
      {caption && <span className="plot-corner pc-bl">{caption}</span>}
      <div className="plot-legend">
        {legend === 'battle' ? (
          <>
            <span><i className="legend-you" />YOU</span>
            <span><i className="legend-allies" />OTHERS</span>
            <span><i className="legend-target" />ENEMY</span>
          </>
        ) : (
          <>
            <span><i className="legend-allies" />COMMANDERS</span>
            <span><i className="legend-target" />ENEMY</span>
          </>
        )}
      </div>
    </div>
  )
})
