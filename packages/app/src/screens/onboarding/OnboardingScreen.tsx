import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { ComponentProps } from 'react'
import { useRef, useState } from 'react'
import { FlatList, Pressable, Text, View, type ViewToken } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useOnboardingComplete } from 'src/hooks/useOnboardingComplete'
import { iconColors } from 'src/theme'
import { OnboardingSlide } from './components/OnboardingSlide'
import { PaginationDots } from './components/PaginationDots'

interface SlideData {
  id: string
  icon: ComponentProps<typeof MaterialIcons>['name']
  title: string
  description: string
  iconColor?: string
}

const SLIDES: SlideData[] = [
  {
    id: '1',
    icon: 'nature',
    title: 'Track your plant family',
    description: 'Keep all your plants organized in one beautiful place',
    iconColor: iconColors.primary,
  },
  {
    id: '2',
    icon: 'notifications-active',
    title: 'Never miss a watering',
    description:
      'Smart reminders help you care for your plants at just the right time',
    iconColor: iconColors.waterBlue,
  },
  {
    id: '3',
    icon: 'psychology',
    title: 'Learn and grow together',
    description:
      'Get personalized tips from our AI assistant to help your plants thrive',
    iconColor: iconColors.achievementGold,
  },
]

export function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList<SlideData>>(null)
  const { completeOnboarding } = useOnboardingComplete()

  const isLastSlide = currentIndex === SLIDES.length - 1

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
    <SafeAreaView className="flex-1 bg-background">
      {/* Skip Button */}
      <View className="flex-row justify-end px-4 py-2">
        <Pressable onPress={handleSkip} className="py-2 px-4">
          <Text className="text-base font-medium text-text-muted">Skip</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
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
            total={SLIDES.length}
            current={currentIndex}
          />
        </View>

        {/* Next / Get Started Button */}
        <Pressable
          onPress={handleNext}
          className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark"
        >
          <Text className="text-base font-semibold text-white mr-2">
            {isLastSlide ? 'Get Started' : 'Next'}
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
