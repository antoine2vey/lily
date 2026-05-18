import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { PlantImageBadge } from '@/components/PlantImageBadge'
import { useIconColors } from '@/hooks/useIconColors'

interface Plant {
  id: string
  name: string
  imageUrl?: string | undefined
}

interface HydrationCardProps {
  plants: ReadonlyArray<Plant>
  onWaterAll: () => void
  onPlantPress: (plantId: string) => void
  isLoading?: boolean | undefined
}

const AUTO_SCROLL_PX_PER_FRAME = 0.3
const AUTO_SCROLL_START_DELAY_MS = 800
const AUTO_SCROLL_MIN_PLANTS = 4

interface PlantCircleProps {
  plant: Plant
  onPress: () => void
  iconColors: ReturnType<typeof useIconColors>
}

function PlantCircle({ plant, onPress, iconColors }: PlantCircleProps) {
  const { t } = useTranslation('home')
  const isDark = iconColors.isDark

  return (
    <Pressable
      onPress={onPress}
      className="items-center gap-2"
      accessibilityLabel={t('hydration.viewPlant', { name: plant.name })}
    >
      <PlantImageBadge
        imageUrl={plant.imageUrl}
        size={72}
        badgeIcon="water-drop"
        badgeColor={iconColors.waterBlue}
        badgeBgColor={isDark ? '#1E3050' : '#E3F2FD'}
      />
      {/* Plant name */}
      <Text
        className="text-xs font-semibold"
        style={{ color: isDark ? '#D1D5DB' : '#374151' }}
        numberOfLines={1}
      >
        {plant.name}
      </Text>
    </Pressable>
  )
}

export function HydrationCard({
  plants,
  onWaterAll,
  onPlantPress,
  isLoading = false,
}: HydrationCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  const scrollRef = useRef<ScrollView>(null)
  const offsetRef = useRef(0)
  const lastScrolledIntPxRef = useRef(0)
  const contentWidthRef = useRef(0)
  const viewportWidthRef = useRef(0)
  const userInteractedRef = useRef(false)
  const plantCount = Array.length(plants)

  useEffect(() => {
    if (plantCount < AUTO_SCROLL_MIN_PLANTS) return

    userInteractedRef.current = false
    let rafId: number | null = null
    let startTimer: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      const maxOffset = Math.max(
        0,
        contentWidthRef.current - viewportWidthRef.current
      )
      if (userInteractedRef.current || offsetRef.current >= maxOffset) {
        rafId = null
        return
      }
      offsetRef.current += AUTO_SCROLL_PX_PER_FRAME
      const nextIntPx = Math.floor(offsetRef.current)
      if (nextIntPx !== lastScrolledIntPxRef.current) {
        lastScrolledIntPxRef.current = nextIntPx
        scrollRef.current?.scrollTo({ x: nextIntPx, animated: false })
      }
      rafId = requestAnimationFrame(tick)
    }

    startTimer = setTimeout(() => {
      rafId = requestAnimationFrame(tick)
    }, AUTO_SCROLL_START_DELAY_MS)

    return () => {
      if (startTimer) clearTimeout(startTimer)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [plantCount])

  if (Array.isEmptyReadonlyArray(plants)) {
    return null
  }

  const gradientColors: [string, string, string] = isDark
    ? ['#1E2A1A', '#243320', '#2D3728']
    : ['#dceccb', '#eaf6df', '#ffffff']

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 32,
        padding: 24,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.06,
        shadowRadius: 20,
        elevation: 4,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <View className="flex-row items-start justify-between mb-6">
        <View>
          <Text
            className="text-xl mb-1 font-bold"
            style={{ color: isDark ? '#FFFFFF' : '#1A1A1A' }}
          >
            {t('hydration.title')}
          </Text>
          <Text
            className="text-sm font-medium"
            style={{ color: isDark ? '#9CA3AF' : '#475569' }}
          >
            {t('hydration.plantsNeedWater', { count: Array.length(plants) })}
          </Text>
        </View>
        {/* Water drop icon */}
        <View
          className="p-2 rounded-full"
          style={{
            backgroundColor: isDark
              ? 'rgba(155, 199, 109, 0.2)'
              : 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <MaterialIcons
            name="water-drop"
            size={24}
            color={iconColors.primary}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportWidthRef.current = e.nativeEvent.layout.width
        }}
        onContentSizeChange={(w) => {
          contentWidthRef.current = w
        }}
        onScrollBeginDrag={() => {
          userInteractedRef.current = true
        }}
        onScroll={(e) => {
          if (!userInteractedRef.current) return
          offsetRef.current = e.nativeEvent.contentOffset.x
        }}
        style={{ marginHorizontal: -24, marginBottom: 28 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        {Array.map(plants, (plant) => (
          <PlantCircle
            key={plant.id}
            plant={plant}
            onPress={() => onPlantPress(plant.id)}
            iconColors={iconColors}
          />
        ))}
      </ScrollView>

      {/* Water All Button */}
      <Pressable
        onPress={onWaterAll}
        disabled={isLoading}
        className={`h-12 rounded-full flex-row items-center justify-center gap-2 ${isLoading ? 'bg-primary/60' : 'bg-primary'}`}
        style={{
          shadowColor: iconColors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
        accessibilityLabel={t('hydration.waterAllPlants')}
        accessibilityRole="button"
      >
        <MaterialIcons name="check-circle" size={20} color={iconColors.white} />
        <Text className="text-[15px] text-white font-bold">
          {isLoading ? t('hydration.wateringAll') : t('hydration.waterAll')}
        </Text>
      </Pressable>
    </LinearGradient>
  )
}
