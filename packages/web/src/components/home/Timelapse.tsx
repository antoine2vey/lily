import { Array, Option, pipe } from 'effect'
import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n'
import type { Messages } from '@/i18n/en'

const FPS = 12
const FRAMES = 180
const AUTO_MS = 14000
// [months since Jun 1, clip second]: where each season actually lands in the footage.
const KEYS: ReadonlyArray<readonly [month: number, second: number]> = [
  [0, 0],
  [3, 3.3],
  [6, 7.3],
  [9, 11.2],
  [12, 14.95],
]
// Horizontal centre of each pot in the source frame, as a fraction of its width.
const POTS = [0.32, 0.67] as const
// Months since Jun 1 at which each note appears. The two feeds run on their own clocks so the sides interleave.
const LILY_AT = [
  0.3, 0.9, 1.4, 2.3, 2.9, 3.6, 4.4, 5.0, 5.6, 6.5, 7.6, 8.4, 9.2, 9.8, 10.6,
  11.4,
] as const
const GUESS_AT = [
  0.5, 1.1, 1.7, 2.5, 3.1, 3.9, 4.8, 5.6, 6.5, 7.4, 8.3, 9.1, 9.9, 10.7, 11.4,
] as const
// Phones show one note per side, so they play a sparser cut of each feed that keeps every note up for about 2.5 seconds.
const NARROW_LILY: ReadonlyArray<number> = [0, 3, 6, 9, 12, 15]
const NARROW_GUESS: ReadonlyArray<number> = [0, 3, 6, 9, 14]

// Frames load coarse to fine so scrubbing works before the download finishes; the last frame jumps the queue.
const LOAD_ORDER: ReadonlyArray<number> = (() => {
  const order: number[] = []
  for (const step of [24, 8, 4, 2, 1])
    for (let i = 0; i < FRAMES; i += step) if (!order.includes(i)) order.push(i)
  return [0, FRAMES - 1, ...order.filter((i) => i !== 0 && i !== FRAMES - 1)]
})()
const READY_AT = LOAD_ORDER.length - Math.floor(FRAMES / 2)

const clamp = (x: number) => Math.max(0, Math.min(12, x))
const clipAt = (m: number): number => {
  for (let k = 1; k < KEYS.length; k++) {
    const [m0, t0] = KEYS[k - 1] ?? [0, 0]
    const [m1, t1] = KEYS[k] ?? [12, 15]
    if (m <= m1) return t0 + ((t1 - t0) * (m - m0)) / (m1 - m0)
  }
  return 15
}
const frameAt = (m: number) => Math.min(FRAMES - 1, clipAt(m) * FPS)

interface Note {
  readonly at: number
  readonly render: () => HTMLElement
}

type Mode = 'idle' | 'auto' | 'coast' | 'drag'

declare global {
  interface Window {
    __tl?: {
      seek: (m: number) => void
      state: () => { m: number; mode: Mode; loaded: number; played: boolean }
    }
  }
}

function lilyNote({
  when,
  title,
  body,
}: Messages['Timelapse']['lily'][number]): HTMLElement {
  const n = document.createElement('div')
  n.className = 'note lily'
  n.innerHTML =
    '<div class="ic"></div><div><b></b><span></span></div><time></time>'
  const [b, span, time] = [
    n.querySelector('b'),
    n.querySelector('span'),
    n.querySelector('time'),
  ]
  if (b) b.textContent = title
  if (span) span.textContent = body
  if (time) time.textContent = when
  return n
}

function guessNote(text: string): HTMLElement {
  const n = document.createElement('div')
  n.className = 'note guess'
  n.textContent = `💭 ${text}`
  return n
}

function mount(root: HTMLElement, t: Messages['Timelapse']): () => void {
  const q = <E extends Element>(sel: string): E => {
    const el = root.querySelector<E>(sel)
    if (!el) throw new Error(`timelapse: missing ${sel}`)
    return el
  }
  const film = q<HTMLDivElement>('.film')
  const cv = q<HTMLCanvasElement>('canvas')
  const scrub = q<HTMLDivElement>('.scrub')
  const play = q<HTMLButtonElement>('.play')
  const stackL = q<HTMLDivElement>('.stack.l')
  const stackR = q<HTMLDivElement>('.stack.r')
  const knobLabel = q<HTMLElement>('.knob b')
  const monthEls = Array.fromIterable(q<HTMLDivElement>('.months').children)
  const g = cv.getContext('2d')
  if (!g) return () => {}

  const narrow = matchMedia('(max-width: 860px)').matches
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const W = narrow ? 960 : 1920
  const H = (W * 9) / 16
  const STACK = narrow ? 1 : 3
  const cut = (notes: ReadonlyArray<Note>, keep: ReadonlyArray<number>) =>
    narrow ? Array.filter(notes, (_, i) => Array.contains(keep, i)) : notes
  const lily = cut(
    Array.zipWith(LILY_AT, t.lily, (at, x) => ({
      at,
      render: () => lilyNote(x),
    })),
    NARROW_LILY
  )
  const guesses = cut(
    Array.zipWith(GUESS_AT, t.guesses, (at, x) => ({
      at,
      render: () => guessNote(x),
    })),
    NARROW_GUESS
  )

  let disposed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  const frames: (ImageBitmap | undefined)[] = Array.makeBy(
    FRAMES,
    () => undefined
  )
  let loaded = 0
  let loading = false
  const loadAll = () => {
    if (loading) return
    loading = true
    let next = 0
    const worker = async () => {
      while (next < LOAD_ORDER.length && !disposed) {
        const i = LOAD_ORDER[next++] ?? 0
        try {
          const res = await fetch(
            `/tl/${W}/${String(i + 1).padStart(3, '0')}.avif`,
            { priority: 'low' }
          )
          const bmp = await createImageBitmap(await res.blob())
          if (disposed) return bmp.close()
          frames[i] = bmp
          loaded++
        } catch {
          continue
        }
        if (Math.abs(i - frameAt(m)) < 12) wake()
        maybeAuto()
      }
    }
    for (let k = 0; k < 4; k++) void worker()
  }
  const nearest = (i: number) => {
    for (let d = 0; d < FRAMES; d++) {
      const a = frames[i - d] ?? frames[i + d]
      if (a) return a
    }
    return undefined
  }

  let crop: readonly [number, number, number, number] = [0, 0, W, H]
  const fit = () => {
    const r = film.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio, 1.5)
    cv.width = Math.round(r.width * dpr)
    cv.height = Math.round(r.height * dpr)
    const box = r.width / r.height
    crop =
      box < W / H
        ? [(W - H * box) / 2, 0, H * box, H]
        : [0, (H - W / box) / 2, W, W / box]
    film.style.setProperty(
      '--lx',
      `${(((POTS[0] * W - crop[0]) / crop[2]) * 100).toFixed(1)}%`
    )
    film.style.setProperty(
      '--rx',
      `${(((POTS[1] * W - crop[0]) / crop[2]) * 100).toFixed(1)}%`
    )
    wake()
  }

  let m = 0
  let mode: Mode = 'idle'
  let played = reduced
  let v = 0
  let dirty = true
  let raf = 0
  let last = 0
  let shownMonth = 0

  const draw = (img: ImageBitmap, alpha: number) => {
    g.globalAlpha = alpha
    g.drawImage(
      img,
      crop[0],
      crop[1],
      crop[2],
      crop[3],
      0,
      0,
      cv.width,
      cv.height
    )
  }

  // Shows the last STACK notes whose time has passed, newest on top. Entering rows grow from 0fr, leaving rows collapse to 0fr.
  const syncStack = (el: HTMLElement, list: ReadonlyArray<Note>) => {
    let n = 0
    while (n < list.length && (list[n]?.at ?? 99) <= m) n++
    if (el.dataset.n === String(n)) return
    el.dataset.n = String(n)
    const lo = Math.max(0, n - STACK)
    const live = (c: Element) =>
      c instanceof HTMLElement && !c.classList.contains('exit')
    const keyOf = (c: Element) => Number((c as HTMLElement).dataset.k)
    for (const it of Array.fromIterable(el.children)) {
      const k = keyOf(it)
      if ((k < lo || k >= n) && live(it)) {
        it.classList.remove('enter', 'grow')
        it.classList.add('exit')
        later(() => it.remove(), reduced ? 0 : 380)
      }
    }
    for (let k = n - 1; k >= lo; k--) {
      const note = list[k]
      if (
        !note ||
        Array.some(
          Array.fromIterable(el.children),
          (c) => keyOf(c) === k && live(c)
        )
      )
        continue
      const it = document.createElement('div')
      it.className = 'item enter'
      it.dataset.k = String(k)
      const inner = document.createElement('div')
      inner.append(note.render())
      it.append(inner)
      el.insertBefore(
        it,
        pipe(
          Array.findFirst(Array.fromIterable(el.children), (c) => keyOf(c) < k),
          Option.getOrNull
        )
      )
      void it.offsetHeight
      it.classList.replace('enter', 'grow')
      later(() => it.classList.remove('grow'), 460)
    }
  }

  const render = () => {
    const f = frameAt(m)
    const i = Math.floor(f)
    const a = f - i
    const A = nearest(i)
    const B = frames[i + 1]
    if (A) {
      draw(A, 1)
      if (a > 0.02 && A === frames[i] && B) draw(B, a)
    }
    scrub.style.setProperty('--p', (m / 12).toFixed(4))
    const mi = Math.min(11, Math.floor(m))
    if (mi !== shownMonth) {
      monthEls[shownMonth]?.classList.remove('on')
      monthEls[mi]?.classList.add('on')
      shownMonth = mi
      knobLabel.textContent = t.months[mi] ?? ''
      scrub.setAttribute('aria-valuenow', String(mi))
      scrub.setAttribute('aria-valuetext', t.months[mi] ?? '')
    }
    syncStack(stackL, lily)
    syncStack(stackR, guesses)
  }

  const tick = (now: number) => {
    const dt = last ? Math.min(50, now - last) : 16
    last = now
    if (mode === 'auto') {
      m += (dt * 12) / AUTO_MS
      if (m >= 12) {
        m = 12
        setMode('idle')
        finishIntro()
      }
      dirty = true
    }
    if (mode === 'coast') {
      m = clamp(m + v * dt)
      v *= 0.88 ** (dt / 16.7)
      if (Math.abs(v) < 5e-5 || m === 0 || m === 12) setMode('idle')
      dirty = true
    }
    if (dirty) {
      dirty = false
      render()
    }
    raf = mode === 'auto' || mode === 'coast' ? requestAnimationFrame(tick) : 0
    if (!raf) last = 0
  }
  function wake() {
    dirty = true
    if (!raf && !disposed) raf = requestAnimationFrame(tick)
  }
  function setMode(next: Mode) {
    mode = next
    film.classList.toggle('grabbing', next === 'drag')
    play.dataset.s = next === 'auto' ? 'pause' : m >= 12 ? 'replay' : 'play'
    play.setAttribute(
      'aria-label',
      next === 'auto' ? t.pause : m >= 12 ? t.replay : t.play
    )
    wake()
  }
  const finishIntro = () => {
    if (played) return
    played = true
    scrub.classList.add('ready')
  }
  const touched = () => {
    played = true
    scrub.classList.remove('ready')
  }

  let inView = false
  function maybeAuto() {
    if (inView && !played && mode === 'idle' && loaded >= READY_AT) {
      m = 0
      setMode('auto')
    }
  }
  const resize = new ResizeObserver(fit)
  resize.observe(film)
  // Frames wait for the window load event so none of their bytes compete with first paint.
  const loadAfterPage = () =>
    document.readyState === 'complete'
      ? loadAll()
      : addEventListener('load', loadAll, { once: true })
  const near = new IntersectionObserver(
    ([e]) => e?.isIntersecting && loadAfterPage(),
    { rootMargin: '100% 0px' }
  )
  near.observe(film)
  const seen = new IntersectionObserver(
    ([e]) => {
      inView = e?.isIntersecting ?? false
      maybeAuto()
    },
    { threshold: 0.55 }
  )
  seen.observe(film)
  if (reduced) scrub.classList.add('ready')

  // Drag: the film scrubs relative to where you grabbed it, the rail jumps to where you press.
  let grab:
    | { kind: 'film' | 'rail'; x: number; m: number; box: DOMRect }
    | undefined
  const samples: (readonly [number, number])[] = []
  const moveDrag = (e: PointerEvent) => {
    if (!grab) return
    m = clamp(
      grab.kind === 'film'
        ? grab.m + ((e.clientX - grab.x) / grab.box.width) * 12
        : ((e.clientX - grab.box.left) / grab.box.width) * 12
    )
    samples.push([e.timeStamp, m])
    if (samples.length > 5) samples.shift()
    wake()
  }
  const startDrag = (kind: 'film' | 'rail') => (e: PointerEvent) => {
    const el = kind === 'film' ? film : scrub
    touched()
    el.setPointerCapture(e.pointerId)
    grab = { kind, x: e.clientX, m, box: el.getBoundingClientRect() }
    samples.length = 0
    setMode('drag')
    moveDrag(e)
  }
  const endDrag = () => {
    if (!grab) return
    const { kind } = grab
    grab = undefined
    const [t0, m0] = samples[0] ?? [0, m]
    const [t1, m1] = samples.at(-1) ?? [0, m]
    v =
      t1 - t0 > 0 ? Math.max(-0.008, Math.min(0.008, (m1 - m0) / (t1 - t0))) : 0
    setMode(kind === 'film' && Math.abs(v) > 3e-4 ? 'coast' : 'idle')
  }
  const cancelDrag = () => {
    grab = undefined
    setMode('idle')
  }
  const STEPS: Record<string, number> = {
    ArrowRight: 0.5,
    ArrowUp: 0.5,
    ArrowLeft: -0.5,
    ArrowDown: -0.5,
    PageUp: 3,
    PageDown: -3,
  }
  const onKey = (e: KeyboardEvent) => {
    const step = STEPS[e.key]
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    touched()
    m = e.key === 'Home' ? 0 : e.key === 'End' ? 12 : clamp(m + (step ?? 0))
    setMode('idle')
  }
  const onPlay = () => {
    touched()
    loadAll()
    if (mode === 'auto') return setMode('idle')
    if (m >= 12) m = 0
    setMode('auto')
  }

  const filmDown = startDrag('film')
  const railDown = startDrag('rail')
  film.addEventListener('pointerdown', filmDown)
  scrub.addEventListener('pointerdown', railDown)
  for (const el of [film, scrub]) {
    el.addEventListener('pointermove', moveDrag)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', cancelDrag)
  }
  scrub.addEventListener('keydown', onKey)
  play.addEventListener('click', onPlay)

  window.__tl = {
    seek: (x) => {
      touched()
      m = clamp(x)
      setMode('idle')
    },
    state: () => ({ m, mode, loaded, played }),
  }

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    for (const id of timers) clearTimeout(id)
    resize.disconnect()
    near.disconnect()
    removeEventListener('load', loadAll)
    seen.disconnect()
    film.removeEventListener('pointerdown', filmDown)
    scrub.removeEventListener('pointerdown', railDown)
    for (const el of [film, scrub]) {
      el.removeEventListener('pointermove', moveDrag)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', cancelDrag)
    }
    scrub.removeEventListener('keydown', onKey)
    play.removeEventListener('click', onPlay)
    stackL.replaceChildren()
    stackR.replaceChildren()
    for (const f of frames) f?.close()
    delete window.__tl
  }
}

export function Timelapse() {
  const { m } = useI18n()
  const t = m.Timelapse
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = ref.current
    return root ? mount(root, t) : undefined
  }, [t])

  return (
    <section ref={ref} className="tlhero" id="year">
      <div className="film">
        <img
          className="poster"
          src="/tl/1920/001.avif"
          srcSet="/tl/960/001.avif 960w, /tl/1920/001.avif 1920w"
          sizes="100vw"
          width={1920}
          height={1080}
          alt=""
          fetchPriority="high"
        />
        <canvas />
        <span className="tag l">
          <span className="ic" aria-hidden="true" />
          {t.tagLily}
        </span>
        <span className="tag r">{t.tagGuess}</span>
      </div>
      <div className="tl-copy">
        <h1>
          <span className="kicker">{t.kicker}</span>
          {t.title}
          <br />
          <em>{t.titleEm}</em>
        </h1>
        <p className="sub">{t.sub}</p>
        <div className="cta">
          <a className="p" href="#download">
            {t.cta}
          </a>
          <a className="s" href="#app">
            {t.ctaSecondary}
          </a>
        </div>
      </div>
      <div className="notes">
        <div className="stack l" aria-live="polite" />
        <div className="stack r" />
      </div>
      <div className="dock">
        <button
          type="button"
          className="play"
          data-s="play"
          aria-label={t.play}
        >
          <svg className="s-play" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.8v12.4a1 1 0 0 0 1.5.86l10.3-6.2a1 1 0 0 0 0-1.72L9.5 4.94A1 1 0 0 0 8 5.8z" />
          </svg>
          <svg className="s-pause" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4.2" height="14" rx="1.4" />
            <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" />
          </svg>
          <svg className="s-replay" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4.2h4.2" />
          </svg>
        </button>
        <div
          className="scrub"
          role="slider"
          tabIndex={0}
          aria-label={t.slider}
          aria-valuemin={0}
          aria-valuemax={11}
          aria-valuenow={0}
          aria-valuetext={t.months[0]}
        >
          <div className="rail" />
          <div className="rail lit" />
          <div className="months">
            {Array.map(t.months, (x, i) => (
              <span key={x} className={i === 0 ? 'on' : undefined}>
                {x.slice(0, 1)}
                <i>{x.slice(1)}</i>
              </span>
            ))}
          </div>
          <div className="knob">
            <b data-drag={t.dragMe}>{t.months[0]}</b>
          </div>
        </div>
        <p className="fine">{t.fine}</p>
      </div>
    </section>
  )
}
