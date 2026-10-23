import type { ReactNode } from 'react'
import { Dimensions, View } from 'react-native'
import { HERO_MASCOT_TOP } from '@/components/MascotHero'
import { SlideTextContent } from './SlideTextContent'

const { width } = Dimensions.get('window')

export interface SlideProps {
  title: string
  subtitle: string
  /** The slide the carousel is showing: replays its entrance animations. */
  isActive: boolean
  /** The visible slide or one swipe away: mounts its mascot video. */
  isNear: boolean
}

interface SlideLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

/** Mascot anchored where every auth screen puts it, title and subtitle at the bottom. */
export function SlideLayout({ title, subtitle, children }: SlideLayoutProps) {
  return (
    <View style={{ width }} className="flex-1 px-8">
      <View
        className="flex-1 items-center"
        style={{ paddingTop: HERO_MASCOT_TOP }}
      >
        {children}
      </View>
      <SlideTextContent title={title} subtitle={subtitle} />
    </View>
  )
}

/**
 * How long a slide waits after it stops being active before resetting its
 * entrance animation. Longer than a paging swipe, so the reset happens off
 * screen instead of blinking out while the slide is still moving away.
 */
export const OFFSCREEN_RESET_MS = 600
