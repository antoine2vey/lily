import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
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
import { MeshBackground } from '@/components'
import { useWelcomeSeen } from '@/hooks/useWelcomeSeen'
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
    ({ index }: { item: number; index: number }) =>
      pipe(
        Match.value(index as 0 | 1 | 2 | 3),
        Match.when(0, () => (
          <PainSlide
            title={t('slides.pain.title')}
            subtitle={t('slides.pain.subtitle')}
          />
        )),
        Match.when(1, () => (
          <IntelligenceSlide
            title={t('slides.intelligence.title')}
            subtitle={t('slides.intelligence.subtitle')}
          />
        )),
        Match.when(2, () => (
          <TransformationSlide
            title={t('slides.transformation.title')}
            subtitle={t('slides.transformation.subtitle')}
          />
        )),
        Match.when(3, () => (
          <CTASlide
            title={t('slides.cta.title')}
            subtitle={t('slides.cta.subtitle')}
          />
        )),
        Match.exhaustive
      ),
    [t]
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
            className="absolute z-10 right-6"
            style={{ top: insets.top + 12 }}
          >
            <Pressable onPress={handleDismiss} className="py-2 px-3">
              <Text
                className="text-sm text-white/40"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {t('skip')}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        <AnimatedFlatList
          ref={flatListRef}
          data={[0, 1, 2, 3]}
          renderItem={renderSlide}
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

        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="px-6 pt-2"
        >
          <WelcomeProgressBar scrollX={scrollX} total={TOTAL_SLIDES} />

          <View className="flex-row items-center mt-4">
            <View className="flex-1 items-start">
              <Pressable
                onPress={handlePrev}
                disabled={isFirst}
                className="w-12 h-12 rounded-full bg-white/10 items-center justify-center"
                style={{ opacity: isFirst ? 0.2 : 1 }}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={28}
                  color="rgba(255,255,255,0.8)"
                />
              </Pressable>
            </View>

            <Text
              className="text-sm text-white/40"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {currentIndex + 1} / {TOTAL_SLIDES}
            </Text>

            <View className="flex-1 items-end">
              {isLast ? (
                <Pressable
                  onPress={handleDismiss}
                  className="h-12 px-5 rounded-full bg-primary items-center justify-center flex-row gap-1.5"
                >
                  <Text
                    className="text-sm text-white"
                    style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                  >
                    {t('getStarted')}
                  </Text>
                  <MaterialIcons
                    name="arrow-forward"
                    size={16}
                    color="rgba(255,255,255,0.9)"
                  />
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleNext}
                  className="w-12 h-12 rounded-full bg-white/10 items-center justify-center"
                >
                  <MaterialIcons
                    name="chevron-right"
                    size={28}
                    color="rgba(255,255,255,0.8)"
                  />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </MeshBackground>
  )
}
