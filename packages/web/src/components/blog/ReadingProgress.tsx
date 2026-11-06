import { useEffect, useRef } from 'react'

// Writes the bar's scale straight to the DOM so scrolling never re-renders the post.
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const update = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      bar.current?.style.setProperty(
        'transform',
        `scaleX(${total > 0 ? Math.min(window.scrollY / total, 1) : 0})`
      )
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1"
    >
      <div ref={bar} className="h-full origin-left scale-x-0 bg-primary" />
    </div>
  )
}
