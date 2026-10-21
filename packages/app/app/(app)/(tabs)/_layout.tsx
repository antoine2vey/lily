import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router'
import { NativeTabs } from 'expo-router/native-tabs'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useColorScheme, View } from 'react-native'
import { useCareTabBadge } from '@/hooks/useCareTabBadge'
import { useIconColors } from '@/hooks/useIconColors'
import { useGlass } from '@/utils/glass'

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

const tabIcon = (name: MaterialIconName) => (
  <NativeTabs.Trigger.Icon
    src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name={name} />}
  />
)

export default function TabsLayout() {
  const { t } = useTranslation('common')
  // Liquid Glass (iOS 26) flickers on any re-render → dot badge (boolean, no
  // per-completion re-render). Android / older iOS → numeric badge.
  const careBadge = useCareTabBadge(!useGlass)
  const iconColors = useIconColors()
  const colorScheme = useColorScheme()

  // Memoize appearance-driving config keyed on the underlying color values, not
  // the (per-render) iconColors object. NativeTabs recomputes + re-applies the
  // native bar appearance from these on every render; keeping them referentially
  // stable means a badge-count re-render doesn't churn the native tab bar.
  const iconColor = useMemo(
    () => ({ default: iconColors.muted, selected: iconColors.primary }),
    [iconColors.muted, iconColors.primary]
  )
  const labelStyle = useMemo(
    () => ({
      fontFamily: 'SpaceGrotesk_400Regular',
      fontSize: 9,
      fontWeight: '400' as const,
      color: iconColors.textSecondary,
    }),
    [iconColors.textSecondary]
  )
  const icons = useMemo(
    () => ({
      home: tabIcon('home'),
      plants: tabIcon('local-florist'),
      care: tabIcon('water-drop'),
      profile: tabIcon('person'),
    }),
    []
  )

  return (
    <View className="flex-1">
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <NativeTabs
          // "never" (not "onScrollDown"): completing a task removes a card, which
          // shrinks the scroll content and reads as scroll motion to iOS — with a
          // scroll-driven minimize the floating bar repeatedly morphs to a pill and
          // back, which looked like the tab bar "shaking" during completions.
          minimizeBehavior="never"
          backgroundColor={iconColors.background}
          indicatorColor={iconColors.surfaceTinted}
          tintColor={iconColors.primary}
          iconColor={iconColor}
          labelStyle={labelStyle}
        >
          <NativeTabs.Trigger name="index">
            {icons.home}
            <NativeTabs.Trigger.Label>
              {t('tabs.home')}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="plants">
            {icons.plants}
            <NativeTabs.Trigger.Label>
              {t('tabs.plants')}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="care">
            {icons.care}
            <NativeTabs.Trigger.Label>
              {t('tabs.care')}
            </NativeTabs.Trigger.Label>
            {/* Liquid Glass → dot (empty Badge), so the tab re-renders only at
                0↔>0 and never flickers during completions. Elsewhere → exact
                number, which updates live without flickering the non-glass bar. */}
            {careBadge.visible &&
              (careBadge.count !== null ? (
                <NativeTabs.Trigger.Badge>
                  {careBadge.count > 99 ? '99+' : String(careBadge.count)}
                </NativeTabs.Trigger.Badge>
              ) : (
                <NativeTabs.Trigger.Badge />
              ))}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            {icons.profile}
            <NativeTabs.Trigger.Label>
              {t('tabs.profile')}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </View>
  )
}
