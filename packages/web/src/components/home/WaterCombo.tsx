import { Array, Option, pipe } from 'effect'
import { useEffect, useRef } from 'react'
import { fmt, useI18n } from '@/i18n'
import type { Messages } from '@/i18n/en'
import { Icon } from './Sprite'

type Kind = 'drop' | 'leaf' | 'gold' | 'flower' | 'confetti' | 'spark'

interface Particle {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  life: number
  size: number
  g: number
  color: string
  center: string
  decay: number
}

interface Palette {
  readonly primary: string
  readonly coral: string
  readonly gold: string
  readonly water: string
}

const MAX_PARTS = 240
const TIER_AT = [1, 5, 10, 18, 28] as const
const SIDE_LAYERS = 20
const SIDE_DEPTH = 30
const BUTTONS = [
  { top: 120, height: 22, side: 'l' },
  { top: 160, height: 44, side: 'l' },
  { top: 214, height: 44, side: 'l' },
  { top: 180, height: 70, side: 'r' },
] as const
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const comboColor = (c: number) =>
  c >= 28 ? '--gold' : c >= 18 ? '--coral' : c >= 10 ? '--water' : '--primary'
const tierIndex = (c: number) =>
  pipe(
    Array.findLastIndex(TIER_AT, (at) => c >= at),
    Option.getOrElse(() => 0)
  )

function mount(root: HTMLElement, t: Messages['WaterCombo']): () => void {
  const q = <E extends Element>(sel: string): E => {
    const el = root.querySelector<E>(sel)
    if (!el) throw new Error(`water combo: missing ${sel}`)
    return el
  }
  const fx = q<HTMLCanvasElement>('canvas.fx')
  const phone = q<HTMLDivElement>('.phone')
  const water = q<HTMLButtonElement>('#water')
  const waterLabel = q<HTMLSpanElement>('#water span')
  const tasks = q<HTMLElement>('.tasks b')
  const bar = q<HTMLElement>('.track i')
  const track = q<HTMLElement>('.track')
  const badge = q<HTMLElement>('.badge')
  const hydrSub = q<HTMLElement>('.hydr p')
  const hint = q<HTMLElement>('.hint span:last-child')
  const comboEl = q<HTMLElement>('.combo')
  const label = q<HTMLElement>('.label')
  const avatars = Array.fromIterable(root.querySelectorAll<HTMLElement>('.av'))
  const ctx = fx.getContext('2d')
  if (!ctx) return () => {}

  // Theme toggles swap the CSS variables, so the canvas palette is re-read only when <html>'s class changes.
  let paletteKey = ''
  let palette: Palette = { primary: '', coral: '', gold: '', water: '' }
  const colors = (): Palette => {
    const key = document.documentElement.className
    if (key !== paletteKey) {
      const s = getComputedStyle(document.documentElement)
      const v = (name: string) => s.getPropertyValue(name).trim()
      palette = {
        primary: v('--primary'),
        coral: v('--coral'),
        gold: v('--gold'),
        water: v('--water'),
      }
      paletteKey = key
    }
    return palette
  }

  const dpr = Math.min(devicePixelRatio, 1.5)
  const resize = () => {
    fx.width = innerWidth * dpr
    fx.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()

  const parts: Particle[] = []
  const room = (n: number) => Math.max(0, Math.min(n, MAX_PARTS - parts.length))

  const burst = (kind: Exclude<Kind, 'spark'>, n: number, power = 1) => {
    const r = water.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const c = colors()
    const mixed = [c.primary, c.coral, c.gold, c.water]
    const fill = {
      drop: c.water,
      leaf: c.primary,
      gold: c.gold,
      flower: c.coral,
      confetti: undefined,
    }[kind]
    for (let i = 0, k = room(n); i < k; i++) {
      const a =
        -Math.PI / 2 +
        (Math.random() - 0.5) * Math.PI * (kind === 'confetti' ? 2 : 1.3)
      const s = rand(6, 16) * power
      parts.push({
        kind,
        x: x + rand(-60, 60),
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        rot: rand(0, 6),
        vr: rand(-0.2, 0.2),
        life: 1,
        size: rand(6, 16),
        g: 0.35,
        color: fill ?? mixed[i % 4] ?? c.primary,
        center: c.gold,
        decay: 0.012,
      })
    }
  }
  // Sparks shoot outward from the phone's left and right edges.
  const sideSparks = (n: number, power = 1) => {
    const r = phone.getBoundingClientRect()
    const c = colors()
    const mixed = [c.gold, c.primary, '#ffffff', c.coral]
    for (let i = 0, k = room(n); i < k; i++) {
      const side = i % 2 ? 1 : -1
      const a = (side > 0 ? 0 : Math.PI) + rand(-0.6, 0.6)
      const s = rand(5, 13) * power
      parts.push({
        kind: 'spark',
        x: side > 0 ? r.right - 4 : r.left + 4,
        y: rand(r.top + 40, r.bottom - 40),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - rand(0, 3),
        rot: 0,
        vr: 0,
        life: 1,
        size: rand(1.5, 3),
        g: 0.12,
        color: mixed[i % 4] ?? '#ffffff',
        center: '',
        decay: rand(0.025, 0.045),
      })
    }
  }
  const drawPart = (p: Particle) => {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6))
    if (p.kind === 'spark') {
      ctx.strokeStyle = p.color
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2)
      ctx.lineTo(p.x, p.y)
      ctx.lineWidth = p.size * 3.5
      ctx.globalAlpha *= 0.25
      ctx.stroke()
      ctx.lineWidth = p.size
      ctx.globalAlpha *= 4
      ctx.stroke()
      ctx.restore()
      return
    }
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    const s = p.size
    ctx.fillStyle = p.color
    if (p.kind === 'drop') {
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.quadraticCurveTo(s * 0.8, s * 0.3, 0, s * 0.7)
      ctx.quadraticCurveTo(-s * 0.8, s * 0.3, 0, -s)
      ctx.fill()
    } else if (p.kind === 'leaf' || p.kind === 'gold') {
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 1.2, s * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.15)'
      ctx.beginPath()
      ctx.moveTo(-s, 0)
      ctx.lineTo(s, 0)
      ctx.stroke()
    } else if (p.kind === 'flower') {
      for (let k = 0; k < 5; k++) {
        ctx.rotate((Math.PI * 2) / 5)
        ctx.beginPath()
        ctx.ellipse(s * 0.6, 0, s * 0.6, s * 0.35, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = p.center
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.3, 0, 7)
      ctx.fill()
    } else ctx.fillRect(-s / 2, -s / 4, s, s / 2)
    ctx.restore()
  }

  const retrigger = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }
  const shake = () => retrigger(phone, 'shake')
  const TIER_FX = [
    () => {
      burst('drop', 3)
      sideSparks(2, 0.7)
    },
    () => {
      burst('drop', 4)
      burst('leaf', 2)
      sideSparks(4)
    },
    () => {
      burst('drop', 4)
      burst('leaf', 3, 1.2)
      sideSparks(6, 1.2)
    },
    () => {
      burst('leaf', 4, 1.3)
      burst('flower', 3, 1.3)
      sideSparks(8, 1.4)
      shake()
    },
    () => {
      burst('confetti', 14, 1.6)
      burst('flower', 4, 1.5)
      sideSparks(10, 1.7)
      shake()
    },
  ] as const

  let combo = 0
  let glow = 0
  let lastGlow = ''
  let decayTimer: ReturnType<typeof setTimeout> | undefined
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const render = () => {
    const done = 1 + combo
    tasks.textContent = fmt(t.tasks, { done }) + (done > 6 ? ' 🤯' : '')
    bar.style.width = `${Math.min(100, (done / 6) * 100)}%`
    track.classList.toggle('over', done > 6)
    badge.textContent = String(Math.max(0, 28 - combo))
    hydrSub.textContent = t.hydrationStates[combo === 0 ? 0 : combo < 3 ? 1 : 2]
    waterLabel.textContent =
      t.tiers[tierIndex(Math.max(1, combo))]?.button ?? t.tiers[0].button
  }
  const flashLabel = (text: string, color = '--coral', ink = '#fff') => {
    label.textContent = text
    label.style.setProperty('--c', `var(${color})`)
    label.style.setProperty('--ink', ink)
    for (const a of label.getAnimations()) a.cancel()
    label.animate(
      [
        {
          opacity: 0,
          transform: 'translateX(-50%) translateY(14px) scale(.6)',
        },
        { opacity: 1, transform: 'translateX(-50%) scale(1.1)', offset: 0.15 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.75 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-10px)' },
      ],
      { duration: 1700, easing: 'ease-out' }
    )
  }
  const decay = () => {
    combo = 0
    comboEl.classList.remove('show')
    hint.textContent = t.hints[0]
    render()
  }

  const onTap = (e: PointerEvent) => {
    e.preventDefault()
    combo++
    const tier = tierIndex(combo)
    TIER_FX[tier]?.()
    glow = Math.min(1, glow + 0.12)
    avatars.forEach((a, i) => {
      const id = setTimeout(() => {
        timers.delete(id)
        retrigger(a, 'bounce')
      }, i * 60)
      timers.add(id)
    })
    retrigger(badge, 'bounce')
    const tierLabel = t.tiers[tier]?.label
    if (Math.random() < 1 / 12) {
      burst('gold', 3, 1.4)
      sideSparks(6, 1.3)
      flashLabel(t.rare, '--gold', '#1A1A1A')
    } else if (tierLabel && TIER_AT[tier] === combo) flashLabel(tierLabel)
    if (combo >= 3) {
      comboEl.innerHTML = `<small>×</small>${combo}`
      comboEl.style.setProperty('--c', `var(${comboColor(combo)})`)
      comboEl.style.setProperty(
        '--s',
        (1 + Math.min(combo, 40) * 0.012).toFixed(3)
      )
      retrigger(comboEl, 'show')
    }
    navigator.vibrate?.(Math.min(40, 8 + combo))
    hint.textContent = t.hints[combo < 5 ? 1 : combo < 18 ? 2 : 3]
    render()
    clearTimeout(decayTimer)
    decayTimer = setTimeout(decay, 1300)
  }

  // The loop only runs while the section is on screen; particles already in flight finish first.
  let visible = false
  let raf = 0
  const loop = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (!p) continue
      p.vy += p.g
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life -= p.decay
      if (p.life <= 0 || p.y > innerHeight + 40) parts.splice(i, 1)
      else drawPart(p)
    }
    // While a combo is live, the phone edges keep fizzing.
    if (combo >= 5 && Math.random() < Math.min(0.3, combo / 80))
      sideSparks(1, 0.8)
    glow = Math.max(combo ? 0.1 : 0, glow - 0.006)
    const gl = glow.toFixed(2)
    if (gl !== lastGlow) {
      lastGlow = gl
      phone.style.setProperty('--glow', gl)
    }
    raf = visible || parts.length ? requestAnimationFrame(loop) : 0
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e?.isIntersecting ?? false
    if (visible && !raf) raf = requestAnimationFrame(loop)
  })
  io.observe(root)

  water.addEventListener('pointerdown', onTap)
  addEventListener('resize', resize)

  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(decayTimer)
    for (const id of timers) clearTimeout(id)
    io.disconnect()
    water.removeEventListener('pointerdown', onTap)
    removeEventListener('resize', resize)
  }
}

const PLANT_ART = [
  <svg key="snake" className="art" viewBox="0 0 50 50" aria-hidden="true">
    <rect width="50" height="50" fill="#2f4a33" />
    <path
      d="M14 50 18 14l6 36M24 50l4-40 5 40M31 50l6-30 2 30"
      fill="#6f9a52"
      stroke="#c9d98a"
      strokeWidth="1.2"
    />
  </svg>,
  <svg key="pothos" className="art" viewBox="0 0 50 50" aria-hidden="true">
    <rect width="50" height="50" fill="#e9dcc9" />
    <g fill="#7fa65a">
      <path d="M10 22c6-8 14-6 14 2-6 4-12 3-14-2Z" />
      <path d="M26 16c8-6 15-2 13 6-7 2-12 0-13-6Z" />
      <path d="M18 36c4-9 13-9 15-1-6 5-12 5-15 1Z" />
      <path d="M33 34c5-6 12-4 12 3-5 3-10 2-12-3Z" />
    </g>
    <rect x="14" y="40" width="22" height="10" rx="2" fill="#c47a55" />
  </svg>,
  <svg key="fern" className="art" viewBox="0 0 50 50" aria-hidden="true">
    <rect width="50" height="50" fill="#1f2a22" />
    <g stroke="#7c9e5c" strokeWidth="1.4" fill="none">
      <path d="M25 50C22 32 14 22 4 16" />
      <path d="M25 50c2-18 10-28 21-34" />
      <path d="M25 50V8" />
    </g>
    <g stroke="#9bc76d" strokeWidth="1">
      <path d="M25 14l-5-3M25 14l5-3M25 22l-6-3M25 22l6-3M25 30l-6-2M25 30l6-2M13 24l-1-5M13 24l-5 1M37 24l1-5M37 24l5 1" />
    </g>
  </svg>,
] as const

const DOTS: ReadonlyArray<ReadonlyArray<string | undefined>> = [
  [undefined, undefined, 'var(--gold)'],
  ['#5eead4', '#5eead4'],
  [undefined, undefined],
  [undefined],
  ['var(--gold)'],
  [undefined],
]

const TAB_ICONS = [
  <svg key="home" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" fill="currentColor" />
  </svg>,
  <svg
    key="plants"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle cx="12" cy="9" r="3" fill="currentColor" />
    <path
      d="M12 3a3 3 0 0 1 3 3 3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3-3ZM5 16c3 0 6 2 7 5 1-3 4-5 7-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  </svg>,
  <Icon key="care" id="drop" size={14} />,
  <svg
    key="profile"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="4" fill="currentColor" />
    <path d="M4 21c1-5 4-7 8-7s7 2 8 7z" fill="currentColor" />
  </svg>,
] as const

export function WaterCombo() {
  const { m } = useI18n()
  const t = m.WaterCombo
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = ref.current
    return root ? mount(root, t) : undefined
  }, [t])

  return (
    <section ref={ref} className="wc" id="app">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="copy">
        <h2>
          {t.title}
          <br />
          <em>{t.titleEm}</em>
        </h2>
        <p className="sub">{t.sub}</p>
        <div className="cta">
          <a className="p" href="#download">
            {t.cta}
          </a>
          <a className="s" href="#inside">
            {t.ctaSecondary}
          </a>
        </div>
        <div className="hint">
          <span className="dot" />
          <span>{t.hints[0]}</span>
        </div>
      </div>

      <div className="stage">
        <div className="floor" />
        <figure className="phone" aria-label={t.phoneLabel}>
          <div className="shell">
            <div className="back" />
            {Array.map(BUTTONS, (b) => (
              <div
                key={`${b.side}${b.top}`}
                className={`btn ${b.side}`}
                style={{ top: b.top, height: b.height }}
              />
            ))}
            {Array.makeBy(SIDE_LAYERS - 1, (k) => {
              const d = (k + 1) / SIDE_LAYERS
              const L = 16 + Math.sin(Math.PI * d) * 30
              return (
                <div
                  key={k}
                  className="layer"
                  style={{
                    transform: `translateZ(${-d * SIDE_DEPTH}px)`,
                    background: `linear-gradient(90deg, hsl(120 4% ${L - 8}%), hsl(120 5% ${L + 8}%) 50%, hsl(120 4% ${L - 8}%))`,
                  }}
                />
              )
            })}
          </div>
          <div className="bezel">
            <div className="screen">
              <div className="island" />
              <div className="status">
                <span>13:31</span>
                <span className="r">
                  <svg
                    width="16"
                    height="10"
                    viewBox="0 0 16 10"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 9.5 1 3a10 10 0 0 1 14 0z"
                      fill="currentColor"
                    />
                  </svg>
                  <svg
                    width="20"
                    height="10"
                    viewBox="0 0 20 10"
                    aria-hidden="true"
                  >
                    <rect
                      x=".5"
                      y=".5"
                      width="17"
                      height="9"
                      rx="2.5"
                      fill="none"
                      stroke="currentColor"
                      opacity=".5"
                    />
                    <rect
                      x="2"
                      y="2"
                      width="13"
                      height="6"
                      rx="1.5"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>

              <div className="top">
                <div>
                  <div className="greet">
                    {t.greeting}
                    <br />
                    Alex ☀️
                  </div>
                  <div className="meta">{t.weather}</div>
                </div>
                <div className="pills">
                  <div className="row">
                    <span className="pill">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 1v8M1 5h8"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                      {t.addPlant}
                    </span>
                    <span className="pill bell">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="badge">28</span>
                    </span>
                  </div>
                  <span className="pill">
                    <Icon id="spark" size={11} className="text-primary" />
                    {t.askLily}
                  </span>
                </div>
              </div>

              <div className="today">{t.today}</div>
              <div className="tasks">
                <b>{fmt(t.tasks, { done: 1 })}</b>
                <span>{t.level}</span>
              </div>
              <div className="track">
                <i />
              </div>

              <div className="hydr">
                <h3>{t.hydration}</h3>
                <p>{t.hydrationStates[0]}</p>
                <span className="ic">
                  <Icon id="drop" size={13} className="text-primary" />
                </span>
                <div className="plants">
                  {Array.map(Array.zip(t.plants, PLANT_ART), ([name, art]) => (
                    <div key={name} className="pl">
                      <div className="av">
                        {art}
                        <span className="drop">
                          <Icon id="drop" size={10} className="text-water" />
                        </span>
                      </div>
                      {name}
                    </div>
                  ))}
                </div>
                <button type="button" className="water-all" id="water">
                  <Icon id="check" size={15} />
                  <span>{t.tiers[0].button}</span>
                </button>
              </div>

              <div className="row-att">
                <span className="w">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 3 2 20h20Z" fill="var(--coral)" />
                    <path
                      d="M12 9v5M12 16.5v.5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <div>
                  <b>{t.attention}</b>
                  <span>{t.attentionCount}</span>
                </div>
              </div>
              <div className="week-h">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="16"
                    rx="3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M3 10h18M8 3v4M16 3v4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
                {t.week}
              </div>
              <div className="week">
                {Array.map(Array.zip(t.days, DOTS), ([day, dots], i) => (
                  <div key={day} className={i === 0 ? 'day on' : 'day'}>
                    {day}
                    <b>{21 + i}</b>
                    <span className="dots">
                      {Array.map(dots, (bg, k) => (
                        <i
                          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative row that never reorders
                          key={k}
                          style={bg ? { background: bg } : undefined}
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>

              <div className="tabbar">
                {Array.map(Array.zip(t.tabs, TAB_ICONS), ([tab, icon], i) => (
                  <div key={tab} className={i === 0 ? 'tab on' : 'tab'}>
                    {icon}
                    {tab}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="glare" />
        </figure>
      </div>
      <div className="hud" aria-hidden="true">
        <div className="combo" />
        <div className="label" />
      </div>
      <canvas className="fx" />
    </section>
  )
}
