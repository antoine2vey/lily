import { Match, pipe } from 'effect'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassCard, GlassLink, MeshBackground } from '@/components'
import { Button } from '@/components/ui'
import { useWelcomeSeen } from '@/hooks/useWelcomeSeen'
import { WelcomeNavButton } from './components/WelcomeNavButton'
import { WelcomeProgressBar } from './components/WelcomeProgressBar'
import { CTASlide } from './slides/CTASlide'
import { IntelligenceSlide } from './slides/IntelligenceSlide'
import { PainSlide } from './slides/PainSlide'
import { TransformationSlide } from './slides/TransformationSlide'

const { width } = Dimensions.get('window')
const TOTAL_SLIDES = 4

const AnimatedFlatList = Animated.FlatList

export function WelcomeCarouselScreen() {
  const { t } = useTranslation('welcome')
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { markWelcomeSeen } = useWelcomeSeen()
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentIndexRef = useRef(0)
  const flatListRef = useRef<Animated.FlatList<number>>(null)
  const scrollX = useSharedValue(0)

  const handleDismiss = useCallback(async () => {
    await markWelcomeSeen()
    router.replace('/(auth)/login')
  }, [markWelcomeSeen, router])

  const scrollToIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true })
    currentIndexRef.current = index
    setCurrentIndex(index)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1)
    }
  }, [currentIndex, scrollToIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < TOTAL_SLIDES - 1) {
      scrollToIndex(currentIndex + 1)
    }
  }, [currentIndex, scrollToIndex])

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
  })

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / width)
      if (newIndex !== currentIndexRef.current) {
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    },
    []
  )

  const renderSlide = useCallback(
    ({ index }: { item: number; index: number }) => {
      const slideState = {
        isActive: index === currentIndex,
        isNear: Math.abs(index - currentIndex) <= 1,
      }
      return pipe(
        Match.value(index as 0 | 1 | 2 | 3),
        Match.when(0, () => (
          <PainSlide
            title={t('slides.pain.title')}
            subtitle={t('slides.pain.subtitle')}
            {...slideState}
          />
        )),
        Match.when(1, () => (
          <IntelligenceSlide
            title={t('slides.intelligence.title')}
            subtitle={t('slides.intelligence.subtitle')}
            cardAction={t('slides.intelligence.cardAction')}
            {...slideState}
          />
        )),
        Match.when(2, () => (
          <TransformationSlide
            title={t('slides.transformation.title')}
            subtitle={t('slides.transformation.subtitle')}
            streakUnit={t('slides.transformation.streakUnit')}
            {...slideState}
          />
        )),
        Match.when(3, () => (
          <CTASlide
            title={t('slides.cta.title')}
            subtitle={t('slides.cta.subtitle')}
            {...slideState}
          />
        )),
        Match.exhaustive
      )
    },
    [t, currentIndex]
  )

  const isFirst = currentIndex === 0
  const isLast = currentIndex === TOTAL_SLIDES - 1

  return (
    <MeshBackground>
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        {!isLast && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute z-10 right-4 px-3"
            style={{ top: insets.top + 8 }}
          >
            <GlassLink
              testID="welcome-skip"
              label={t('skip')}
              onPress={handleDismiss}
            />
          </Animated.View>
        )}

        <AnimatedFlatList
          ref={flatListRef}
          data={[0, 1, 2, 3]}
          renderItem={renderSlide}
          extraData={currentIndex}
          keyExtractor={(item) => String(item)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />

        <GlassCard padding="sm">
          <WelcomeProgressBar scrollX={scrollX} total={TOTAL_SLIDES} />

          <View className="flex-row items-center gap-3">
            <WelcomeNavButton
              icon="chevron-left"
              label={t('previous')}
              onPress={handlePrev}
              disabled={isFirst}
            />

            {isLast ? (
              <Animated.View entering={FadeIn.duration(250)} className="flex-1">
                <Button
                  testID="welcome-get-started"
                  icon="arrow-forward"
                  onPress={handleDismiss}
                  pill
                >
                  {t('getStarted')}
                </Button>
              </Animated.View>
            ) : (
              <>
                <Text
                  className="flex-1 text-sm text-white/75 text-center"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {currentIndex + 1} / {TOTAL_SLIDES}
                </Text>
                <WelcomeNavButton
                  icon="chevron-right"
                  label={t('next')}
                  onPress={handleNext}
                />
              </>
            )}
          </View>
        </GlassCard>
      </View>
    </MeshBackground>
  )
}
