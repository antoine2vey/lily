import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ListRow } from 'src/components/ListRow'
import { useIconColors } from 'src/hooks/useIconColors'

export function AboutScreen() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('about')
  const iconColors = useIconColors()

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="flex-1 text-lg text-center mr-10 font-semibold text-text-primary dark:text-white">
          {t('title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* Logo & App Info */}
        <View className="items-center pt-8 pb-6">
          <View className="w-20 h-20 rounded-2xl items-center justify-center mb-4 bg-primary-tint">
            <MaterialIcons
              name="local-florist"
              size={40}
              color={iconColors.primary}
            />
          </View>
          <Text className="text-2xl font-bold text-text-primary dark:text-white">
            {t('appName')}
          </Text>
          <Text className="text-xs mt-1 uppercase tracking-wider font-semibold text-primary">
            {t('version', { version: '1.0.0' })}
          </Text>
        </View>

        {/* Mission Quote */}
        <View className="px-8 py-6">
          <Text className="text-sm text-center italic font-regular text-text-muted leading-[22px]">
            "{t('description')}"
          </Text>
        </View>

        {/* Links Section */}
        <View className="px-6 py-4 border-t border-border dark:border-slate-700">
          <ListRow
            leftIcon={
              <MaterialIcons name="code" size={18} color={iconColors.primary} />
            }
            title={t('links.licenses')}
            showChevron
            onPress={() => {
              // TODO: Replace with a dedicated licenses screen
              Linking.openURL(
                'https://github.com/lily-app/lily/blob/main/LICENSES.md'
              )
            }}
          />
          <ListRow
            leftIcon={
              <MaterialIcons
                name="groups"
                size={18}
                color={iconColors.primary}
              />
            }
            title={t('links.guidelines')}
            showChevron
            onPress={() => Linking.openURL('https://lily.app/guidelines')}
          />
          <ListRow
            leftIcon={
              <MaterialIcons
                name="camera-alt"
                size={18}
                color={iconColors.primary}
              />
            }
            title={t('links.instagram')}
            rightElement={
              <MaterialIcons
                name="open-in-new"
                size={16}
                color={iconColors.textMuted}
              />
            }
            onPress={() => Linking.openURL('https://instagram.com/lilyapp')}
          />
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Footer */}
        <View className="px-6 py-8 items-center">
          <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
            {t('footer')}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
