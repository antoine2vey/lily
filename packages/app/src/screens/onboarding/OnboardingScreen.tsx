import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { ComponentProps } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, Text, View, type ViewToken } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIconColors } from 'src/hooks/useIconColors'
import { useOnboardingComplete } from 'src/hooks/useOnboardingComplete'
import { OnboardingSlide } from './components/OnboardingSlide'
import { PaginationDots } from './components/PaginationDots'

interface SlideData {
  id: string
  icon: ComponentProps<typeof MaterialIcons>['name']
  title: string
  description: string
  iconColor?: string
}

export function OnboardingScreen() {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList<SlideData>>(null)
  const { completeOnboarding } = useOnboardingComplete()

  const slides: SlideData[] = [
    {
      id: '1',
      icon: 'nature',
      title: t('slides.track.title'),
      description: t('slides.track.description'),
      iconColor: iconColors.primary,
    },
    {
      id: '2',
      icon: 'notifications-active',
      title: t('slides.reminders.title'),
      description: t('slides.reminders.description'),
      iconColor: iconColors.waterBlue,
    },
    {
      id: '3',
      icon: 'psychology',
      title: t('slides.learn.title'),
      description: t('slides.learn.description'),
      iconColor: iconColors.achievementGold,
    },
  ]
  const isLastSlide = currentIndex === slides.length - 1

  const handleSkip = async () => {
    await completeOnboarding()
    router.replace('/(app)/(tabs)')
  }

  const handleNext = async () => {
    if (isLastSlide) {
      await completeOnboarding()
      router.replace('/(app)/(tabs)')
    } else {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      })
    }
  }

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index)
      }
    }
  ).current

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      {/* Skip Button */}
      <View className="flex-row justify-end px-4 py-2">
        <Pressable onPress={handleSkip} className="py-2 px-4">
          <Text className="text-base font-medium text-text-muted dark:text-slate-400">
            {t('buttons.skip')}
          </Text>
        </Pressable>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OnboardingSlide
            icon={item.icon}
            title={item.title}
            description={item.description}
            iconColor={item.iconColor}
          />
        )}
      />

      {/* Bottom Section */}
      <View className="px-6 pb-8">
        {/* Pagination Dots */}
        <View className="mb-8">
          <PaginationDots
            testID="pagination-dots"
            total={slides.length}
            current={currentIndex}
          />
        </View>

        {/* Next / Get Started Button */}
        <Pressable
          onPress={handleNext}
          className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark"
        >
          <Text className="text-base font-semibold text-white mr-2">
            {isLastSlide ? t('buttons.getStarted') : t('buttons.next')}
          </Text>
          <MaterialIcons
            name={isLastSlide ? 'check' : 'arrow-forward'}
            size={20}
            color={iconColors.white}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
