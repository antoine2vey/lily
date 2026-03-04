'use client'

import { useEffect, useState } from 'react'

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => {
      const scrolled = window.scrollY
      const total = document.documentElement.scrollHeight - window.innerHeight
      setProgress(total > 0 ? Math.min((scrolled / total) * 100, 100) : 0)
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  const showDot = progress > 1 && progress < 99

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 bottom-0 z-40 pointer-events-none"
      style={{ width: 8 }}
    >
      {/* Track */}
      <div className="absolute inset-0 shadow-neu-inset-sm" />

      {/* Fill */}
      <div
        className="absolute top-0 left-0 w-full bg-primary"
        style={{ height: `${progress}%` }}
      />

      {/* Dot at tip */}
      <div
        className="absolute left-1/2 rounded-full bg-primary"
        style={{
          width: 10,
          height: 10,
          top: `${progress}%`,
          transform: 'translate(-50%, -50%)',
          opacity: showDot ? 1 : 0,
          boxShadow: '0 0 6px 2px #80ac5366',
          transition: 'opacity 0.2s ease',
        }}
      />
    </div>
  )
}
