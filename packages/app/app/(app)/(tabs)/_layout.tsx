import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import {
  Badge,
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from 'expo-router/unstable-native-tabs'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useCareBadgeCount } from '@/hooks/useCareBadgeCount'
import { useIconColors } from '@/hooks/useIconColors'

type MaterialIconName = keyof typeof MaterialIcons.glyphMap

export default function TabsLayout() {
  const { t } = useTranslation('common')
  const careBadgeCount = useCareBadgeCount()
  const iconColors = useIconColors()

  const tabIcon = (name: MaterialIconName) => (
    <Icon src={<VectorIcon family={MaterialIcons} name={name} />} />
  )

  return (
    <View className="flex-1">
      <NativeTabs
        minimizeBehavior="onScrollDown"
        backgroundColor={iconColors.background}
        indicatorColor={iconColors.surfaceTinted}
        tintColor={iconColors.primary}
        iconColor={{
          default: iconColors.muted,
          selected: iconColors.primary,
        }}
        labelStyle={{
          fontFamily: 'SpaceGrotesk_400Regular',
          fontSize: 9,
          fontWeight: '400',
          color: iconColors.textSecondary,
        }}
      >
        <NativeTabs.Trigger name="index">
          {tabIcon('home')}
          <Label>{t('tabs.home')}</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="plants">
          {tabIcon('local-florist')}
          <Label>{t('tabs.plants')}</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="care">
          {tabIcon('water-drop')}
          <Label>{t('tabs.care')}</Label>
          {careBadgeCount > 0 && (
            <Badge>
              {careBadgeCount > 99 ? '99+' : String(careBadgeCount)}
            </Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          {tabIcon('person')}
          <Label>{t('tabs.profile')}</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  )
}
