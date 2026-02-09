import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe } from 'effect'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from 'src/components/Avatar'
import { PullToRefresh } from 'src/components/PullToRefresh'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'
import { Button } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { useLocalization } from 'src/hooks/useLocalization'
import { useRecentActivities } from 'src/hooks/useRecentActivities'
import { useUser } from 'src/hooks/useUser'
import { useWaterAll } from 'src/hooks/useWaterAll'
import { AddPlantOptionsSheet } from 'src/screens/add-plant/AddPlantOptionsSheet'
import { useEffectQuery } from 'src/utils/client'
import { HydrationCard } from './components/HydrationCard'
import { RecentActivity } from './components/RecentActivity'
import { StatsRow } from './components/StatsRow'

function HomeContentSkeleton() {
  return (
    <>
      {/* Hydration Card */}
      <View className="mb-8 mt-2">
        <View className="bg-surface dark:bg-surface-dark rounded-[32px] p-6">
          <View className="flex-row items-start justify-between mb-6">
            <View className="gap-1">
              <SkeletonBox width={120} height={20} rounded="sm" />
              <SkeletonBox width={150} height={14} rounded="sm" />
            </View>
            <SkeletonCircle size={40} />
          </View>
          <View className="flex-row items-start gap-5 mb-7">
            {[1, 2, 3].map((i) => (
              <View key={i} className="items-center gap-2">
                <SkeletonCircle size={72} />
                <SkeletonBox width={48} height={12} rounded="sm" />
              </View>
            ))}
          </View>
          <SkeletonBox width="100%" height={48} rounded="full" />
        </View>
      </View>

      {/* Stats Row */}
      <View className="mb-8">
        <View className="flex-row gap-3">
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="flex-1 bg-white dark:bg-surface-dark rounded-[20px] py-4 px-2 items-center border border-slate-100 dark:border-slate-700"
            >
              <SkeletonBox
                width={32}
                height={28}
                rounded="sm"
                className="mb-1"
              />
              <SkeletonBox width={48} height={10} rounded="sm" />
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
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            className="flex-row items-center bg-white dark:bg-surface-dark rounded-[20px] p-4 gap-4"
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
  const { t } = useLocalization()
  const [showAddPlant, setShowAddPlant] = useState(false)

  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch: refetchPlants,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' },
  })

  const { data: overduePlantsData, refetch: refetchOverdue } = useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: {
        page: '1',
        limit: '50',
        filter: 'overdue',
        sort: 'added',
      },
    }
  )

  const { data: recentActivities, refetch: refetchActivities } =
    useRecentActivities(5)

  const { mutate: waterAll, isPending: isWateringAll } = useWaterAll()

  const userName = pipe(
    Match.value(state),
    Match.when(
      { _tag: 'Authenticated' },
      ({ user }) => user.username ?? user.name ?? null
    ),
    Match.orElse(() => null)
  )

  const getGreeting = (): string => {
    const hour = new Date().getHours()
    if (hour < 12) return t('home:greeting.morning')
    if (hour < 18) return t('home:greeting.afternoon')
    return t('home:greeting.evening')
  }

  const { data: userSettings } = useUser()
  const userAvatar = userSettings?.image

  const plantList = plants?.items ?? []
  const hasPlants = plantList.length > 0

  const healthyCount = pipe(
    plantList,
    Array.filter((p) => p.health === 'HEALTHY' || p.health === 'THRIVING'),
    (arr) => arr.length
  )
  const attentionCount = pipe(
    plantList,
    Array.filter((p) => p.health === 'NEEDS_ATTENTION' || p.health === 'SICK'),
    (arr) => arr.length
  )

  const overduePlantList = overduePlantsData?.items ?? []
  const allOverduePlantIds = Array.map(overduePlantList, (p) => p.id)

  const plantsNeedingWater = pipe(
    overduePlantList,
    Array.take(3),
    Array.map((plant) => ({
      id: plant.id,
      name: plant.name,
      imageUrl: plant.imageUrl ?? undefined,
    }))
  )

  const onRefresh = async () => {
    await Promise.all([refetchPlants(), refetchOverdue(), refetchActivities()])
  }

  const handleWaterAll = () => {
    if (allOverduePlantIds.length > 0) {
      waterAll({ payload: { plantIds: allOverduePlantIds } })
    }
  }

  const handlePlantPress = (plantId: string) => {
    router.push(`/plant/${plantId}`)
  }

  const handleActivityPress = (activityId: string) => {
    const activity = pipe(
      Array.findFirst(recentActivities ?? [], (a) => a.id === activityId)
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
            contentContainerStyle={{ flexGrow: 1 }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
          >
            <View className="flex-1 px-6">
              {/* Header - always rendered */}
              <View className="flex-row items-center justify-between pt-8 pb-4">
                <View className="flex-1">
                  <Text className="text-2xl text-text-primary dark:text-white tracking-tight leading-tight font-bold">
                    {getGreeting()},{'\n'}
                    {userName ?? t('home:greeting.defaultName')} ☀️
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Pressable onPress={() => router.push('/settings')}>
                    <Avatar
                      source={userAvatar ? { uri: userAvatar } : undefined}
                      name={userName ?? undefined}
                      size="md"
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/(app)/notification-settings')}
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
                  {plantsNeedingWater.length > 0 && (
                    <View className="mb-8 mt-2">
                      <HydrationCard
                        plants={plantsNeedingWater}
                        onWaterAll={handleWaterAll}
                        onPlantPress={handlePlantPress}
                        isLoading={isWateringAll}
                      />
                    </View>
                  )}

                  <View className="mb-8">
                    <StatsRow
                      total={plantList.length}
                      healthy={healthyCount}
                      attention={attentionCount}
                    />
                  </View>

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
                      onPress={() => setShowAddPlant(true)}
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

      <AddPlantOptionsSheet
        visible={showAddPlant}
        onClose={() => setShowAddPlant(false)}
        onSelectAI={() => router.push('/add-plant/ai-scanner')}
        onSelectScan={() => router.push('/add-plant/nursery-scanner')}
        onSelectManual={() => router.push('/add-plant/manual-basic')}
      />
    </View>
  )
}
