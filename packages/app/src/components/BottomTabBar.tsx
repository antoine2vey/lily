import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import type { Href } from 'expo-router'
import { router, usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIconColors } from '@/hooks/useIconColors'

export interface StandaloneTabBarProps {
  onFabPress: () => void
  careBadgeCount?: number
}

type TabIconName = keyof typeof MaterialIcons.glyphMap

interface TabIconConfig {
  active: TabIconName
  inactive: TabIconName
  hasBadge?: boolean
}

interface TabRoute {
  name: string
  path: string
  labelKey: string
  icon: TabIconConfig
}

export const TAB_ROUTES: ReadonlyArray<TabRoute> = [
  {
    name: 'index',
    path: '/',
    labelKey: 'tabs.home',
    icon: { active: 'home', inactive: 'home' },
  },
  {
    name: 'plants',
    path: '/plants',
    labelKey: 'tabs.plants',
    icon: { active: 'local-florist', inactive: 'local-florist' },
  },
  {
    name: 'care',
    path: '/care',
    labelKey: 'tabs.care',
    icon: { active: 'water-drop', inactive: 'water-drop', hasBadge: true },
  },
  {
    name: 'profile',
    path: '/profile',
    labelKey: 'tabs.profile',
    icon: { active: 'person', inactive: 'person-outline' },
  },
  {
    name: 'chat',
    path: '/chat',
    labelKey: 'tabs.chat',
    icon: { active: 'chat-bubble', inactive: 'chat-bubble-outline' },
  },
]

export const LEFT_ROUTES = Array.take(TAB_ROUTES, 2)
export const RIGHT_ROUTES = Array.drop(TAB_ROUTES, 2)

// Map non-tab paths to their parent tab index
const PATH_TO_TAB: ReadonlyArray<readonly [string, number]> = [
  ['/plant/', 1],
  ['/log-care', 2],
  ['/settings', 3],
  ['/about', 3],
  ['/notification-settings', 3],
  ['/privacy-settings', 3],
  ['/subscription', 3],
  ['/achievements', 3],
]

export const getActiveIndex = (pathname: string): number =>
  pipe(
    Array.findFirstIndex(TAB_ROUTES, (route) =>
      route.path === '/' ? pathname === '/' : pathname.startsWith(route.path)
    ),
    Option.getOrElse(() =>
      pipe(
        Array.findFirst(PATH_TO_TAB, ([prefix]) => pathname.startsWith(prefix)),
        Option.map(([, tabIndex]) => tabIndex),
        Option.getOrElse(() => 0)
      )
    )
  )

export function TabItem({
  iconName,
  label,
  isFocused,
  badgeCount,
  onPress,
  testID,
}: {
  iconName: keyof typeof MaterialIcons.glyphMap
  label: string
  isFocused: boolean
  badgeCount: number
  onPress: () => void
  testID?: string
}) {
  const iconColors = useIconColors()

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className="flex-1 items-center justify-center gap-1"
    >
      <View className="relative">
        <MaterialIcons
          name={iconName}
          size={24}
          color={isFocused ? iconColors.primary : iconColors.muted}
        />
        {badgeCount > 0 && (
          <View className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-error items-center justify-center px-0.5">
            <Text className="text-white text-[10px] font-bold leading-none">
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        )}
      </View>
      <Text
        className={`text-[10px] ${isFocused ? 'text-primary font-bold' : 'text-slate-400 font-semibold'}`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function getTabBadgeCount(
  route: TabRoute,
  careBadgeCount: number
): number {
  return pipe(
    Option.fromNullable(route.icon.hasBadge),
    Option.map(() => careBadgeCount),
    Option.getOrElse(() => 0)
  )
}

export function BottomTabBar({
  onFabPress,
  careBadgeCount = 0,
}: StandaloneTabBarProps) {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const { t } = useTranslation('common')
  const activeIndex = getActiveIndex(pathname)

  const renderTab = (route: TabRoute, index: number) => {
    const isFocused = activeIndex === index
    return (
      <TabItem
        key={route.name}
        testID={`tab-${route.name}`}
        iconName={isFocused ? route.icon.active : route.icon.inactive}
        label={t(route.labelKey)}
        isFocused={isFocused}
        badgeCount={getTabBadgeCount(route, careBadgeCount)}
        onPress={() => {
          if (!isFocused) {
            router.navigate(route.path as Href)
          }
        }}
      />
    )
  }

  return (
    <View
      style={{
        position: 'absolute',
        bottom: insets.bottom + 8,
        left: 20,
        right: 20,
      }}
      pointerEvents="box-none"
    >
      <View
        className="bg-white/90 dark:bg-surface-dark/90"
        style={{
          height: 64,
          borderRadius: 32,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        {Array.map(LEFT_ROUTES, (route, i) => renderTab(route, i))}
        <TabItem
          key="add"
          iconName="add"
          label={t('tabs.add')}
          isFocused={false}
          badgeCount={0}
          onPress={onFabPress}
        />
        {Array.map(RIGHT_ROUTES, (route, i) => renderTab(route, i + 2))}
      </View>
    </View>
  )
}
