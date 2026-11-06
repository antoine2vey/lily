import type { Engine } from '../live'

// Chapter activation, the scroll rail and the scroll reveal for the whole
// story wrapper. Phones and cards have their own engines.
export const mount: Engine<null> = (mag) => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  mag.classList.add('m-js')
  const chapters = [...mag.querySelectorAll<HTMLElement>('.m-ch')]
  const stories = [...mag.querySelectorAll<HTMLElement>('.m-story')]
  const rail = mag.querySelector<HTMLElement>('.m-rail')
  const railItems = rail ? [...rail.querySelectorAll('li')] : []

  const activate = (ch: HTMLElement) => {
    const story = ch.closest('.m-story')
    if (!story) return
    const { i, k, tone } = ch.dataset
    for (const c of story.querySelectorAll('.m-ch'))
      c.classList.toggle('is-on', c === ch)
    for (const el of story.querySelectorAll<HTMLElement>('[data-shot]')) {
      const on = el.dataset.shot === i
      el.classList.toggle('is-on', on)
      el.inert = !on
    }
    const stage = story.querySelector<HTMLElement>('.m-stage')
    if (stage && tone) stage.dataset.tone = tone
    const n = Number(k)
    railItems.forEach((li, idx) => {
      li.classList.toggle('is-on', idx === n)
      li.classList.toggle('past', idx < n)
    })
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) activate(e.target as HTMLElement)
    },
    { rootMargin: '-45% 0px -45% 0px' }
  )
  for (const c of chapters) io.observe(c)

  let span: readonly [number, number] = [0, 1]
  let queued = false
  const onScroll = () => {
    queued = false
    if (!rail) return
    const y = scrollY + innerHeight / 2
    const p = (y - span[0]) / (span[1] - span[0])
    rail.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4))
    rail.classList.toggle('show', p > 0 && p < 1)
  }
  const layoutRail = () => {
    const first = stories[0]
    const last = stories[stories.length - 1]
    if (!first || !last) return
    const top = first.getBoundingClientRect().top + scrollY
    const bottom = last.getBoundingClientRect().bottom + scrollY
    span = [top, bottom]
    chapters.forEach((c, n) => {
      const r = c.getBoundingClientRect()
      const mid = r.top + scrollY + r.height / 2
      const li = railItems[n]
      if (li)
        li.style.top = `${(((mid - top) / (bottom - top)) * 100).toFixed(2)}%`
    })
    onScroll()
  }
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(onScroll)
  }
  addEventListener('scroll', queue, { passive: true })
  addEventListener('resize', layoutRail)
  layoutRail()
  // Lazy images and fonts settle after mount, so measure once more.
  const settle = setTimeout(layoutRail, 1200)

  let rv: IntersectionObserver | undefined
  if (!reduced) {
    rv = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('m-in')
            rv?.unobserve(e.target)
          }
      },
      { rootMargin: '0px 0px -10% 0px' }
    )
    for (const el of mag.querySelectorAll('[data-rv]')) {
      el.classList.add('m-rv')
      rv.observe(el)
    }
  }

  return () => {
    io.disconnect()
    rv?.disconnect()
    clearTimeout(settle)
    removeEventListener('scroll', queue)
    removeEventListener('resize', layoutRail)
    mag.classList.remove('m-js')
  }
}
