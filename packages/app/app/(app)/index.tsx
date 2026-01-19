import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { Stack } from 'expo-router'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from 'react-native'
import { IconButton } from 'src/components/ui'
import { useAuth } from 'src/contexts/AuthContext'
import { colors } from 'src/theme'
import { useEffectQuery } from 'src/utils/client'

export default function HomeScreen() {
  const { state, logout } = useAuth()
  const {
    data: plants,
    isLoading,
    isRefetching,
    refetch,
  } = useEffectQuery('plants', 'getPlants', {
    urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' },
  })

  const userName = pipe(
    Match.value(state),
    Match.when(
      { _tag: 'Authenticated' },
      ({ user }) => user.username ?? user.name
    ),
    Match.orElse(() => 'Plant Parent')
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My Plants',
          headerRight: () => (
            <IconButton
              icon="logout"
              color={colors.textSecondary}
              onPress={logout}
            />
          ),
        }}
      />
      <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
        <View className="flex-1 px-4">
          {/* Welcome Header */}
          <View className="py-4">
            <Text
              className="text-2xl text-text-main dark:text-white"
              style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
            >
              Hello, {userName}!
            </Text>
            <Text
              className="text-base text-text-secondary dark:text-zinc-400 mt-1"
              style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
            >
              {plants?.items.length ?? 0} plants in your garden
            </Text>
          </View>

          {/* Plants List */}
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={plants?.items ?? []}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{
                paddingBottom: 24,
                flexGrow: 1,
              }}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-12">
                  <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center mb-4">
                    <MaterialIcons
                      name="local-florist"
                      size={48}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    className="text-xl text-text-main dark:text-white mb-2"
                    style={{ fontFamily: 'PlusJakartaSans_700Bold' }}
                  >
                    No plants yet
                  </Text>
                  <Text
                    className="text-base text-text-secondary dark:text-zinc-400 text-center"
                    style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
                  >
                    Add your first plant to start{'\n'}your green journey!
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable className="bg-white dark:bg-surface-dark rounded-2xl p-4 mb-3 flex-row items-center active:opacity-80">
                  {/* Plant Icon */}
                  <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mr-4">
                    <MaterialIcons
                      name="eco"
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                  {/* Plant Info */}
                  <View className="flex-1">
                    <Text
                      className="text-lg text-text-main dark:text-white"
                      style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
                    >
                      {item.name}
                    </Text>
                    {item.species && (
                      <Text
                        className="text-sm text-text-secondary dark:text-zinc-400 mt-0.5"
                        style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
                      >
                        {item.species}
                      </Text>
                    )}
                    {item.location && (
                      <View className="flex-row items-center mt-1">
                        <MaterialIcons
                          name="location-on"
                          size={14}
                          color={colors.textSecondary}
                        />
                        <Text
                          className="text-xs text-text-secondary dark:text-zinc-500 ml-1"
                          style={{ fontFamily: 'PlusJakartaSans_400Regular' }}
                        >
                          {item.location}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Chevron */}
                  <MaterialIcons
                    name="chevron-right"
                    size={24}
                    color={colors.textSecondary}
                  />
                </Pressable>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </>
  )
}
