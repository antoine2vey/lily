import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { MaterialIcons } from '@expo/vector-icons'
import { now } from '@lily/shared'
import { Array, DateTime, Match, Option, pipe } from 'effect'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassIconButton } from '@/components/GlassIconButton'
import { ProgressBar } from '@/components/ProgressBar'
import { PullToRefresh } from '@/components/PullToRefresh'
import { SkeletonBox, SkeletonCircle } from '@/components/skeletons'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useTabBarInset } from '@/contexts/TabBarInsetContext'
import { useAchievements } from '@/hooks/useAchievements'
import { useCareAll } from '@/hooks/useCareAll'
import { useCareTasks } from '@/hooks/useCareTasks'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'
import { useUnreadCount } from '@/hooks/useNotifications'
import { useRecentActivities } from '@/hooks/useRecentActivities'
import { useWeather } from '@/hooks/useWeather'
import { AchievementTeaser } from '@/screens/home/components/AchievementTeaser'
import { HydrationCard } from '@/screens/home/components/HydrationCard'
import { RecentActivity } from '@/screens/home/components/RecentActivity'
import { WeeklySchedule } from '@/screens/home/components/WeeklySchedule'
import { useEffectQuery } from '@/utils/client'

const useGlass = isLiquidGlassSupported && Platform.OS === 'ios'

interface AskLilyStickyPillProps {
  onPress: () => void
  primaryColor: string
  label: string
}

function AskLilyStickyPill({
  onPress,
  primaryColor,
  label,
}: AskLilyStickyPillProps) {
  const content = (
    <Pressable
      testID="home-ask-lily-pill"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className="flex-row items-center h-10 pl-3 pr-4">
        <MaterialIcons
          name="auto-awesome"
          size={16}
          color={primaryColor}
          style={{ lineHeight: 16 }}
        />
        <Text
          className="ml-1.5 text-sm text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )

  if (useGlass) {
    return (
      <LiquidGlassView interactive={false} style={{ borderRadius: 20 }}>
        {content}
      </LiquidGlassView>
    )
  }

  return (
    <View
      className="bg-white dark:bg-surface-dark rounded-full"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      {content}
    </View>
  )
}

interface TodaySectionProps {
  label: string
  completedToday: number
  total: number
  tasksDoneSuffix: string
  metaText: string
}

function TodaySection({
  label,
  completedToday,
  total,
  tasksDoneSuffix,
  metaText,
}: TodaySectionProps) {
  const progress = total > 0 ? completedToday / total : 0
  return (
    <View className="mb-6">
      <Text className="text-[11px] uppercase tracking-wide font-medium text-text-muted dark:text-slate-400 mb-2">
        {label}
      </Text>
      <View className="flex-row items-end justify-between mb-2.5">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {`${completedToday}/${total} ${tasksDoneSuffix}`}
        </Text>
        <Text className="text-xs text-text-muted dark:text-slate-400">
          {metaText}
        </Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  )
}

interface WeatherInlineChipProps {
  temperatureC: number
  adjustedCount: number
  adjustedSuffix: string
}

function WeatherInlineChip({
  temperatureC,
  adjustedCount,
  adjustedSuffix,
}: WeatherInlineChipProps) {
  const meta = adjustedCount > 0 ? ` · ${adjustedCount} ${adjustedSuffix}` : ''
  return (
    <Text className="text-xs text-text-muted dark:text-slate-400 mt-1.5">
      {`${Math.round(temperatureC)}°C${meta}`}
    </Text>
  )
}

interface NeedsAttentionRowProps {
  count: number
  title: string
  subtitle: string
  iconColor: string
  mutedColor: string
  onPress: () => void
}

function NeedsAttentionRow({
  count,
  title,
  subtitle,
  iconColor,
  mutedColor,
  onPress,
}: NeedsAttentionRowProps) {
  if (count === 0) return null
  return (
    <Pressable
      testID="home-needs-attention-row"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      className="flex-row items-center py-3 mb-4"
    >
      <View className="w-9 h-9 rounded-full bg-coral/10 dark:bg-coral/20 items-center justify-center">
        <MaterialIcons name="warning" size={18} color={iconColor} />
      </View>
      <View className="ml-3 flex-1">
        <Text
          className="text-sm text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {title}
        </Text>
        <Text className="text-xs text-text-muted dark:text-slate-400 mt-0.5">
          {subtitle}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
    </Pressable>
  )
}

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <View className="absolute -top-1 -right-1 bg-coral rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
      <Text
        className="text-white text-[10px] font-bold"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  )
}

const pillShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
} as const

function StickyAddPill({
  label,
  iconColor,
  onPress,
}: {
  label: string
  iconColor: string
  onPress: () => void
}) {
  const content = (
    <Pressable
      onPress={onPress}
      testID="home-add-plant-pill"
      accessibilityLabel={label}
      className="flex-row items-center gap-1.5 h-10 pl-3 pr-4"
    >
      <MaterialIcons name="add" size={22} color={iconColor} />
      <Text
        className="text-sm text-text-primary dark:text-white"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {label}
      </Text>
    </Pressable>
  )

  if (useGlass) {
    return (
      <LiquidGlassView interactive={false} style={{ borderRadius: 22 }}>
        {content}
      </LiquidGlassView>
    )
  }

  return (
    <View
      className="rounded-full bg-white dark:bg-surface-dark"
      style={pillShadow}
    >
      {content}
    </View>
  )
}

function StickyBell({
  unreadCount,
  iconColor,
  onPress,
}: {
  unreadCount: number
  iconColor: string
  onPress: () => void
}) {
  return (
    <View style={{ width: 40, height: 40 }}>
      <GlassIconButton
        icon="notifications"
        iconColor={iconColor}
        onPress={onPress}
      />
      <NotificationBadge count={unreadCount} />
    </View>
  )
}

function HomeContentSkeleton() {
  return (
    <>
      {/* Streak Card */}
      <View className="bg-surface dark:bg-surface-dark rounded-[24px] p-4 mb-4">
        <View className="flex-row items-center gap-4">
          <SkeletonCircle size={48} />
          <View className="flex-1 gap-1.5">
            <SkeletonBox width={80} height={10} rounded="sm" />
            <SkeletonBox width={140} height={16} rounded="sm" />
          </View>
          <View className="items-end gap-1.5">
            <SkeletonBox width={60} height={22} rounded="full" />
            <SkeletonBox width={80} height={10} rounded="sm" />
          </View>
        </View>
      </View>

      {/* Weather Card */}
      <View className="bg-surface dark:bg-surface-dark rounded-[24px] p-4 mb-4">
        <View className="flex-row items-center gap-4">
          <SkeletonCircle size={48} />
          <View className="flex-1 gap-1.5">
            <SkeletonBox width={60} height={10} rounded="sm" />
            <SkeletonBox width={100} height={14} rounded="sm" />
          </View>
          <SkeletonBox width={90} height={22} rounded="full" />
        </View>
      </View>

      {/* HydrationCard skeleton */}
      <View
        className="rounded-[32px] p-6 mb-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
      >
        <View className="flex-row items-start justify-between mb-6">
          <View className="gap-1.5">
            <SkeletonBox width={140} height={18} rounded="sm" />
            <SkeletonBox width={180} height={14} rounded="sm" />
          </View>
          <SkeletonCircle size={40} />
        </View>
        <View className="flex-row gap-5 mb-7">
          {Array.map([1, 2, 3], (i) => (
            <View key={i} className="items-center gap-2">
              <SkeletonCircle size={72} />
              <SkeletonBox width={48} height={10} rounded="sm" />
            </View>
          ))}
        </View>
        <SkeletonBox width="100%" height={48} rounded="full" />
      </View>

      {/* Weekly Schedule */}
      <View className="mb-8">
        <View className="flex-row items-center gap-2 mb-3 px-1">
          <SkeletonBox width={16} height={16} rounded="sm" />
          <SkeletonBox width={120} height={16} rounded="sm" />
        </View>
        <View className="flex-row gap-2">
          {Array.map([1, 2, 3, 4, 5, 6, 7], (i) => (
            <View
              key={i}
              className="items-center py-3 rounded-2xl gap-2"
              style={{ width: 48, backgroundColor: 'rgba(0,0,0,0.04)' }}
            >
              <SkeletonBox width={24} height={10} rounded="sm" />
              <SkeletonBox width={20} height={16} rounded="sm" />
              <SkeletonBox width={6} height={6} rounded="full" />
            </View>
          ))}
        </View>
      </View>

      {/* Achievement Teaser */}
      <View className="mb-8">
        <View className="flex-row items-center justify-between mb-3 px-1">
          <SkeletonBox width={140} height={16} rounded="sm" />
          <SkeletonBox width={50} height={14} rounded="sm" />
        </View>
        <View className="bg-surface dark:bg-surface-dark rounded-[20px] p-4 gap-4">
          {Array.map([1, 2], (i) => (
            <View key={i} className="gap-2">
              <View className="flex-row items-center gap-3">
                <SkeletonCircle size={36} />
                <View className="flex-1 gap-1">
                  <SkeletonBox width="55%" height={13} rounded="sm" />
                  <SkeletonBox width="35%" height={11} rounded="sm" />
                </View>
                <SkeletonBox width={32} height={13} rounded="sm" />
              </View>
              <SkeletonBox width="100%" height={6} rounded="full" />
            </View>
          ))}
        </View>
      </View>

      {/* Recent Activity */}
      <View className="flex-row items-center justify-between mb-4 px-1">
        <SkeletonBox width={120} height={20} rounded="sm" />
        <SkeletonBox width={50} height={14} rounded="sm" />
      </View>
      <View className="gap-3">
        {Array.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-row items-center bg-surface dark:bg-surface-dark rounded-[20px] p-4 gap-4"
          >
            <SkeletonCircle size={48} />
            <View className="flex-1 gap-1.5">
              <SkeletonBox width="70%" height={14} rounded="sm" />
              <SkeletonBox width="40%" height={12} rounded="sm" />
            </View>
          </View>
        ))}
      </View>
    </>
  )
}

export function HomeScreen() {
  const { state } = useAuth()
  const router = useRouter()
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const tabBarInset = useTabBarInset()
  const { t } = useLocalization()

  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch: refetchPlants,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: {
      page: '1',
      limit: '1',
      filter: 'all',
      sort: 'added',
      includeCaretaking: 'false',
    },
  })

  const { data: recentActivities, refetch: refetchActivities } =
    useRecentActivities(5)

  const { data: careTasksData, refetch: refetchCareTasks } = useCareTasks()
  const { data: achievementsData, refetch: refetchAchievements } =
    useAchievements()
  const weather = useWeather()
  const { count: unreadCount } = useUnreadCount()

  const { data: unhealthyData } = useEffectQuery('plants', 'getPlants', {
    urlParams: {
      page: '1',
      limit: '1',
      filter: 'needsAttention',
      sort: 'added',
      includeCaretaking: 'false',
    },
  })
  const unhealthyCount = Option.getOrElse(
    Option.fromNullable(unhealthyData?.total),
    () => 0
  )

  const weatherTemperatureC = pipe(
    weather.todayWeather,
    Option.flatMap((w) =>
      Option.fromNullable(w.temperatureMean ?? w.temperatureMax)
    ),
    Option.getOrUndefined
  )

  // Greeting prefers the user's real first name when available, falling back
  // to their chosen @handle, then their raw name field (if somehow set without
  // a handle). Null means "no name yet" → use the i18n default.
  const userName = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, ({ user }) =>
      pipe(
        Option.fromNullable(user.firstName),
        Option.orElse(() => Option.fromNullable(user.username)),
        Option.orElse(() => Option.fromNullable(user.name)),
        Option.getOrNull
      )
    ),
    Match.orElse(() => null)
  )

  const getGreeting = (): string => {
    const hour = DateTime.toParts(now()).hours
    if (hour < 12) return t('home:greeting.morning')
    if (hour < 18) return t('home:greeting.afternoon')
    return t('home:greeting.evening')
  }

  const hasPlants =
    Option.getOrElse(Option.fromNullable(plants?.total), () => 0) > 0

  const careTasksOverdue = Option.getOrElse(
    Option.fromNullable(careTasksData?.overdue),
    () => [] as NonNullable<typeof careTasksData>['overdue']
  )
  const careTasksToday = Option.getOrElse(
    Option.fromNullable(careTasksData?.today),
    () => [] as NonNullable<typeof careTasksData>['today']
  )
  const careTasksUpcoming = Option.getOrElse(
    Option.fromNullable(careTasksData?.upcoming),
    () => [] as NonNullable<typeof careTasksData>['upcoming']
  )

  const wateringPlants = useMemo(
    () =>
      pipe(
        Array.appendAll(careTasksOverdue, careTasksToday),
        Array.filter((task) => task.type === 'watering'),
        Array.dedupeWith((a, b) => a.plantId === b.plantId),
        Array.map((task) => ({
          id: task.plantId,
          name: task.plantName,
          imageUrl: Option.getOrUndefined(
            Option.fromNullable(task.plantImageUrl)
          ),
        }))
      ),
    [careTasksOverdue, careTasksToday]
  )

  const careAll = useCareAll()

  const handleWaterAll = useCallback(() => {
    const plantIds = Array.map(wateringPlants, (p) => p.id)
    careAll.mutate({ payload: { plantIds, careType: 'watering' } })
  }, [wateringPlants, careAll])

  const handlePlantPress = useCallback(
    (plantId: string) => {
      router.push(`/plant/${plantId}`)
    },
    [router]
  )

  const onRefresh = async () => {
    await Promise.all([
      refetchPlants(),
      refetchActivities(),
      refetchCareTasks(),
      refetchAchievements(),
      weather.refetch(),
    ])
  }

  const handleActivityPress = (activityId: string) => {
    const activity = Array.findFirst(
      Option.getOrElse(
        Option.fromNullable(recentActivities),
        () => [] as NonNullable<typeof recentActivities>
      ),
      (a) => a.id === activityId
    )
    pipe(
      activity,
      Option.map((a) => {
        router.push(`/plant/${a.plantId}`)
      })
    )
  }

  const handleSeeAllActivities = () => {
    router.push('/(app)/(tabs)/care')
  }

  const isInitialLoading = isLoading && !plants
  const showSkeleton = useDelayedLoading(isInitialLoading)
  const hadInitialData = useRef(!!plants)

  return (
    <View
      testID="home-screen"
      className="flex-1 bg-background dark:bg-background-dark"
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <PullToRefresh isRefreshing={isRefetching} onRefresh={onRefresh}>
        {(scrollHandler) => (
          <Animated.ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: tabBarInset,
            }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
          >
            <View className="flex-1 px-6">
              {/* Greeting - scrolls under sticky pills */}
              <View className="pt-4 pb-4" style={{ paddingRight: 190 }}>
                <Text className="text-2xl text-text-primary dark:text-white tracking-tight leading-tight font-bold">
                  {getGreeting()},{'\n'}
                  {Option.getOrElse(Option.fromNullable(userName), () =>
                    t('home:greeting.defaultName')
                  )}{' '}
                  ☀️
                </Text>
                {weatherTemperatureC !== undefined && (
                  <WeatherInlineChip
                    temperatureC={weatherTemperatureC}
                    adjustedCount={weather.adjustmentSummary.adjustedCount}
                    adjustedSuffix={t('home:weather.adjustedSuffix', {
                      defaultValue: 'plants adjusted',
                    })}
                  />
                )}
              </View>

              {/* Content */}
              {showSkeleton ? (
                <Animated.View entering={FadeIn.duration(300)}>
                  <HomeContentSkeleton />
                </Animated.View>
              ) : isInitialLoading ? null : hasPlants ? (
                <Animated.View
                  {...(hadInitialData.current
                    ? {}
                    : { entering: FadeIn.duration(300) })}
                  className="pb-6"
                >
                  {careTasksData && achievementsData && (
                    <TodaySection
                      label={t('home:today.label', { defaultValue: 'Today' })}
                      completedToday={careTasksData.completedToday}
                      total={
                        careTasksData.completedToday +
                        Array.length(careTasksOverdue) +
                        Array.length(careTasksToday)
                      }
                      tasksDoneSuffix={t('home:today.tasksDoneSuffix', {
                        defaultValue: 'tasks done',
                      })}
                      metaText={`${t('home:streak.level', { level: achievementsData.level })} · ${t('home:streak.achievements', { count: achievementsData.unlockedCount })}`}
                    />
                  )}

                  <HydrationCard
                    plants={wateringPlants}
                    onWaterAll={handleWaterAll}
                    onPlantPress={handlePlantPress}
                    isLoading={careAll.isPending}
                  />

                  <NeedsAttentionRow
                    count={unhealthyCount}
                    title={t('home:needsAttention.title', {
                      defaultValue: 'Needs Attention',
                    })}
                    subtitle={t('home:needsAttention.subtitle', {
                      count: unhealthyCount,
                      defaultValue: `${unhealthyCount} plants`,
                    })}
                    iconColor={iconColors.coral}
                    mutedColor={iconColors.muted}
                    onPress={() =>
                      router.push(
                        '/(app)/(tabs)/plants?filter=needsAttention' as Href
                      )
                    }
                  />

                  <WeeklySchedule
                    overdue={careTasksOverdue}
                    today={careTasksToday}
                    upcoming={careTasksUpcoming}
                  />

                  {achievementsData && (
                    <AchievementTeaser data={achievementsData} />
                  )}

                  <RecentActivity
                    activities={recentActivities}
                    onSeeAll={handleSeeAllActivities}
                    onActivityPress={handleActivityPress}
                  />
                </Animated.View>
              ) : (
                <Animated.View
                  {...(hadInitialData.current
                    ? {}
                    : { entering: FadeIn.duration(300) })}
                  className="flex-1"
                >
                  <View className="gap-1 mt-4">
                    <Text className="text-3xl font-extrabold text-text-primary dark:text-white tracking-tight">
                      {t('home:empty.title')}
                    </Text>
                    <Text className="text-base font-medium text-slate-500 dark:text-slate-400 leading-relaxed w-1/2">
                      {t('home:empty.subtitle')}
                    </Text>
                  </View>

                  <View className="w-full mt-8">
                    <Button
                      icon="add"
                      iconPosition="left"
                      onPress={() => router.push('/add-plant/scanner')}
                      pill
                    >
                      {t('home:empty.addButton')}
                    </Button>
                  </View>
                </Animated.View>
              )}
            </View>
          </Animated.ScrollView>
        )}
      </PullToRefresh>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 24,
          alignItems: 'flex-end',
          gap: 4,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <StickyAddPill
            label={t('home:cta.addPlant', { defaultValue: 'Add plant' })}
            iconColor={iconColors.textPrimary}
            onPress={() => router.push('/add-plant/scanner')}
          />
          <StickyBell
            unreadCount={unreadCount}
            iconColor={iconColors.textPrimary}
            onPress={() => router.push('/(app)/notifications' as Href)}
          />
        </View>
        <AskLilyStickyPill
          label={t('home:askLily.shortLabel', { defaultValue: 'Ask Lily' })}
          primaryColor={iconColors.primary}
          onPress={() => router.push('/chat')}
        />
      </View>
    </View>
  )
}
