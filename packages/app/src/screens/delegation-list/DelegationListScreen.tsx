import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Match, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chip } from '@/components/Chip'
import { EmptyState } from '@/components/EmptyState'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useMyDelegations } from '@/hooks/useMyDelegations'
import { DelegationCard } from '@/screens/delegation-list/components/DelegationCard'
import { DelegationListSkeleton } from '@/screens/delegation-list/components/DelegationListSkeleton'

type FilterRole = 'both' | 'owner' | 'caretaker'

interface FilterOption {
  key: FilterRole
  label: string
}

const filterOptions: ReadonlyArray<FilterOption> = [
  { key: 'both', label: 'All' },
  { key: 'owner', label: 'My Plants' },
  { key: 'caretaker', label: 'Caring For' },
]

const getEmptyStateConfig = (filter: FilterRole) =>
  pipe(
    Match.value(filter),
    Match.when('both', () => ({
      title: 'No delegations yet',
      description:
        'Delegate your plant care to friends when you travel, or help them care for theirs.',
    })),
    Match.when('owner', () => ({
      title: 'No plant delegations',
      description:
        'You have not delegated any of your plants to someone else yet.',
    })),
    Match.when('caretaker', () => ({
      title: 'Not caring for any plants',
      description: 'No one has asked you to care for their plants yet.',
    })),
    Match.exhaustive
  )

export function DelegationListScreen() {
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const [activeFilter, setActiveFilter] = useState<FilterRole>('both')

  const { data, isLoading, isRefetching, refetch } = useMyDelegations({
    role: activeFilter,
  })

  const isInitialLoading = isLoading && !data
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const delegations = pipe(
    Option.fromNullable(data?.items),
    Option.getOrElse(
      () => [] as ReadonlyArray<NonNullable<typeof data>['items'][number]>
    )
  )

  const handleDelegationPress = useCallback((delegationId: string) => {
    router.push(`/delegation/${delegationId}`)
  }, [])

  const emptyConfig = getEmptyStateConfig(activeFilter)

  const renderItem = useCallback(
    ({ item }: { item: (typeof delegations)[number] }) => (
      <Animated.View entering={FadeIn.duration(300)} className="mb-3">
        <DelegationCard
          delegation={item}
          onPress={() => handleDelegationPress(item.id)}
        />
      </Animated.View>
    ),
    [handleDelegationPress]
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-2 pb-4">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text
          className="text-lg font-bold text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          Delegations
        </Text>
        <Pressable
          onPress={() => router.push('/delegation-create')}
          className="w-10 h-10 items-center justify-center rounded-full bg-primary"
        >
          <MaterialIcons name="add" size={24} color="white" />
        </Pressable>
      </View>

      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <DelegationListSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          {/* Filter Chips */}
          <View className="flex-row gap-2 px-6 mb-4">
            {Arr.map(filterOptions, (option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={activeFilter === option.key}
                onPress={() => setActiveFilter(option.key)}
              />
            ))}
          </View>

          {/* List */}
          <FlatList
            data={delegations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: 32,
            }}
            showsVerticalScrollIndicator={false}
            refreshing={isRefetching}
            onRefresh={refetch}
            ListEmptyComponent={
              <EmptyState
                title={emptyConfig.title}
                description={emptyConfig.description}
                action={{
                  label: 'Create Delegation',
                  onPress: () => router.push('/delegation-create'),
                }}
              />
            }
          />
        </Animated.View>
      )}
    </View>
  )
}
