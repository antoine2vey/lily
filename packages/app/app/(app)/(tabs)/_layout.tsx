import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Badge, Label, NativeTabs } from 'expo-router/unstable-native-tabs'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useCareBadgeCount } from '@/hooks/useCareBadgeCount'
import { useIconColors } from '@/hooks/useIconColors'

const TAB_ICON_SIZE = 24

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

export default function TabsLayout() {
  const { t } = useTranslation('common')
  const careBadgeCount = useCareBadgeCount()
  const iconColors = useIconColors()

  const tabIcons = useMemo(() => {
    const make = (name: MaterialIconName) => ({
      icon: {
        src: MaterialIcons.getImageSource(
          name,
          TAB_ICON_SIZE,
          iconColors.muted
        ),
      },
      selectedIcon: {
        src: MaterialIcons.getImageSource(
          name,
          TAB_ICON_SIZE,
          iconColors.primary
        ),
      },
    })
    return {
      home: make('home'),
      plants: make('local-florist'),
      care: make('water-drop'),
      person: make('person'),
    }
  }, [iconColors.muted, iconColors.primary])

  return (
    <View className="flex-1">
      <NativeTabs
        minimizeBehavior="onScrollDown"
        tintColor={iconColors.primary}
        iconColor={{
          default: iconColors.muted,
          selected: iconColors.primary,
        }}
        labelStyle={{
          fontFamily: 'SpaceGrotesk_400Regular',
          fontSize: 9,
          fontWeight: '400',
        }}
      >
        <NativeTabs.Trigger name="index" options={tabIcons.home}>
          <Label>{t('tabs.home')}</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="plants" options={tabIcons.plants}>
          <Label>{t('tabs.plants')}</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="care" options={tabIcons.care}>
          <Label>{t('tabs.care')}</Label>
          {careBadgeCount > 0 && (
            <Badge>
              {careBadgeCount > 99 ? '99+' : String(careBadgeCount)}
            </Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile" options={tabIcons.person}>
          <Label>{t('tabs.profile')}</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  )
}
