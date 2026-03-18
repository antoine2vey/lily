'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import { useRef } from 'react'

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
  const isEven = index % 2 === 0

  // scrollYProgress goes 0 → 1 as the element travels from
  // "top of element at bottom of viewport" to "center of element at center of viewport"
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  })

  const imageX = useTransform(scrollYProgress, [0, 1], [isEven ? -60 : 60, 0])
  const imageOpacity = useTransform(scrollYProgress, [0, 0.6], [0, 1])

  const textY = useTransform(scrollYProgress, [0.15, 1], [40, 0])
  const textOpacity = useTransform(scrollYProgress, [0.15, 0.75], [0, 1])

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-2 py-8 md:py-10`}
    >
      <motion.div
        className="flex-1 flex justify-center"
        style={{ x: imageX, opacity: imageOpacity }}
      >
        <div className="relative w-64 md:w-72 rounded-[2.5rem] overflow-hidden shadow-neu-lg bg-background">
          <Image
            src={`/screenshots/${screenshot}`}
            alt={catchline}
            width={300}
            height={600}
            className="w-full h-auto"
            loading="lazy"
            sizes="(max-width: 768px) 256px, 288px"
          />
        </div>
      </motion.div>

      <motion.div
        className="flex-1 text-center md:text-left"
        style={{ y: textY, opacity: textOpacity }}
      >
        <h2 className="text-3xl md:text-4xl font-bold text-lily-text mb-4 leading-tight">
          {catchline}
        </h2>
        <p className="text-lg text-muted leading-relaxed max-w-md mx-auto md:mx-0">
          {description}
        </p>
      </motion.div>
    </div>
  )
}
