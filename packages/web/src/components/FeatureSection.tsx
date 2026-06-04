'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

interface FeatureSectionProps {
  screenshot: string
  catchline: string
  description: string
  index: number
}

export function FeatureSection({
  screenshot,
  catchline,
  description,
  index,
}: FeatureSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const isEven = index % 2 === 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-2 py-8 md:py-10`}
    >
      <div
        className={`flex-1 flex justify-center transition-all duration-700 ease-out ${
          visible
            ? 'opacity-100 translate-x-0'
            : `opacity-0 ${isEven ? '-translate-x-15' : 'translate-x-15'}`
        }`}
      >
        <div className="relative w-60 md:w-72 drop-shadow-[0_24px_48px_rgba(0,0,0,0.18)]">
          <Image
            src={`/screenshots/${screenshot}`}
            alt={catchline}
            width={600}
            height={1265}
            className="w-full h-auto"
            loading="lazy"
            sizes="(max-width: 768px) 240px, 288px"
          />
        </div>
      </div>

      <div
        className={`flex-1 text-center md:text-left transition-all duration-700 ease-out delay-150 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <h2 className="text-3xl md:text-4xl font-bold text-lily-text mb-4 leading-tight">
          {catchline}
        </h2>
        <p className="text-lg text-muted leading-relaxed max-w-md mx-auto md:mx-0">
          {description}
        </p>
      </div>
    </div>
  )
}
