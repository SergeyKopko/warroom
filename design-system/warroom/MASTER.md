# Design System Master File

> **Source of truth:** `warroom-mvp-v19 (1).html` and `src/styles.css`.
> Page-specific notes under `design-system/pages/` override this file when present.

---

**Project:** WARROOM  
**Category:** Tactical ops interface / on-chain game  
**Motion:** Radar sweep, ambient flights, stamp overlays, marquee, spring modals  
**Density:** Dense / hairline borders / zero radius

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Void background | `#0B0D0F` | `--void` |
| Board | `#0E1216` | `--board` |
| Panel | `#12161A` | `--panel` |
| Panel elevated | `#171C21` | `--panel2` |
| Line | `#242A30` | `--line` |
| Line strong | `#333B42` | `--line2` |
| Ink | `#E8ECEF` | `--ink` |
| Dim | `#94A0A9` | `--dim` |
| Faint | `#5A646D` | `--faint` |
| Fed / ally blue | `#2E9BFF` | `--fed` |
| Fed deep | `#0A2E4E` | `--fed-deep` |
| Rep / enemy red | `#F04A2E` | `--rep` |
| Rep deep | `#4E1509` | `--rep-deep` |
| Amber / CTA | `#FFB020` | `--amber` |
| Amber deep | `#3A2708` | `--amber-deep` |

**Mood:** OLED charcoal, amber accents, blue commanders, red enemy. No green matrix neon. No purple glow. No rounded cards.

### Typography

- **Display:** Chakra Petch (400–700)
- **Mono:** IBM Plex Mono (400–600)
- Body: 15px / 1.45 on `--disp`
- Eyebrows: mono, 10px, letter-spacing `.22em`, uppercase, `--faint`

### Spacing & shape

- Gaps: 9–14px typical; page padding 22px (14px on mobile)
- **Border radius: 0** everywhere
- Borders: 1px `--line` / `--line2`
- Max content width: 1560px

### Motion

| Effect | Spec |
|--------|------|
| Brand pulse | `.brand .dot` 2s infinite |
| Radar sweep | Canvas plot continuous amber ray |
| Ambient flights | Canvas arcs every ~2.4s |
| Mine launch | Amber trail + bloom + shake |
| Stamp | Fast in, delayed fade (`resIn` / `resOut`) |
| Marquee | 34s linear loop |
| Modal | `veil` + spring `present` |
| Feed row | `rowIn` / `slidein` |

Honor `prefers-reduced-motion`: kill marquee loops; canvas may freeze sweep/ambient.

---

## Component Specs

### Buttons

- `.btn` — tracked caps, hairline border, panel fill
- `.btn-amber` / `.btn-fed` — accent bordered fills
- `.launch` — red gradient fire control; hover glow `0 0 26px rgba(240,74,46,.4)`
- `.hbtn` / `.hbtn.amb` / `.hbtn.ico` — header chrome

### Panels

- `.panel` / `.panel-h` / `.panel-b` — no shadow, no radius
- `.notice` — amber border callout

### Plot board

- Canvas `1200×560`, silos + enemy polygon, radar, flights, blooms
- Overlay scanlines `.plot-ov`
- Corner mono captions + legend YOU / OTHERS / ENEMY

### Landing hero

- Brand-scale `WAR` + stroked `ROOM`
- One subline, one hero copy, CTA row, eyebrow
- Marquee metrics then enemy HP → plot+feed → stepline → stats → contracts → legal

---

## Do / Don't

**Do**
- Match MVP class names and copy voice (“ops briefing”)
- Keep amber / fed / rep on charcoal
- Port canvas plot behavior for living board

**Don't**
- Orbitron, JetBrains Mono, or green `#22C55E` themes
- Rounded pills, multi-layer shadows, purple glows
- Cards in the hero
- Invent challenge UX that the on-chain MVP does not support — show trial seats instead
