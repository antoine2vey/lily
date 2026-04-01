import { MaterialIcons } from '@expo/vector-icons'
import { now } from '@lily/shared'
import { Array, DateTime, Match, Option, pipe } from 'effect'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/Avatar'
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
import { useUser } from '@/hooks/useUser'
import { useWeather } from '@/hooks/useWeather'
import { AchievementTeaser } from '@/screens/home/components/AchievementTeaser'
import { DailyProgressCard } from '@/screens/home/components/DailyProgressCard'
import { HydrationCard } from '@/screens/home/components/HydrationCard'
import { PlantHealthAlert } from '@/screens/home/components/PlantHealthAlert'
import { RecentActivity } from '@/screens/home/components/RecentActivity'
import { StreakCard } from '@/screens/home/components/StreakCard'
import { WeatherCard } from '@/screens/home/components/WeatherCard'
import { WeeklySchedule } from '@/screens/home/components/WeeklySchedule'
import { useEffectQuery } from '@/utils/client'

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

  const userName = pipe(
    Match.value(state),
    Match.when({ _tag: 'Authenticated' }, ({ user }) =>
      pipe(
        Option.fromNullable(user.username),
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

  const { data: userSettings } = useUser()
  const userAvatar = userSettings?.image

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
              {/* Header - always rendered */}
              <View className="flex-row items-center justify-between pt-8 pb-4">
                <View className="flex-1">
                  <Text className="text-2xl text-text-primary dark:text-white tracking-tight leading-tight font-bold">
                    {getGreeting()},{'\n'}
                    {Option.getOrElse(Option.fromNullable(userName), () =>
                      t('home:greeting.defaultName')
                    )}{' '}
                    ☀️
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Pressable onPress={() => router.push('/settings')}>
                    <Avatar
                      source={userAvatar ? { uri: userAvatar } : undefined}
                      name={Option.getOrUndefined(
                        Option.fromNullable(userName)
                      )}
                      size="md"
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/(app)/notifications' as Href)}
                    className="w-11 h-11 rounded-full bg-white dark:bg-surface-dark items-center justify-center"
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 2,
                      elevation: 1,
                    }}
                  >
                    <MaterialIcons
                      name="notifications"
                      size={24}
                      color={iconColors.textPrimary}
                    />
                    {unreadCount > 0 && (
                      <View className="absolute -top-1 -right-1 bg-coral rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                        <Text
                          className="text-white text-[10px] font-bold"
                          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Content */}
              {showSkeleton ? (
                <Animated.View entering={FadeIn.duration(300)}>
                  <HomeContentSkeleton />
                </Animated.View>
              ) : isInitialLoading ? null : hasPlants ? (
                <Animated.View
                  entering={
                    hadInitialData.current ? undefined : FadeIn.duration(300)
                  }
                  className="pb-6"
                >
                  {achievementsData && <StreakCard data={achievementsData} />}

                  {careTasksData && (
                    <DailyProgressCard
                      completedToday={careTasksData.completedToday}
                      remainingToday={
                        Array.length(careTasksOverdue) +
                        Array.length(careTasksToday)
                      }
                    />
                  )}

                  <WeatherCard weather={weather} />

                  <HydrationCard
                    plants={wateringPlants}
                    onWaterAll={handleWaterAll}
                    onPlantPress={handlePlantPress}
                    isLoading={careAll.isPending}
                  />

                  <PlantHealthAlert />

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
                  entering={
                    hadInitialData.current ? undefined : FadeIn.duration(300)
                  }
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
    </View>
  )
}
