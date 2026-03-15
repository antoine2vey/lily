import { MaterialIcons } from '@expo/vector-icons'
import { Option } from 'effect'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import { useEffectQuery } from '@/utils/client'

export function PlantHealthAlert() {
  const { t } = useTranslation('home')
  const router = useRouter()
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  const { data } = useEffectQuery('plants', 'getPlants', {
    urlParams: {
      page: '1',
      limit: '1',
      filter: 'needsAttention',
      sort: 'added',
      includeCaretaking: 'false',
    },
  })

  const unhealthyCount = Option.getOrElse(
    Option.fromNullable(data?.total),
    () => 0
  )

  if (unhealthyCount === 0) {
    return null
  }

  return (
    <Pressable
      onPress={() => router.push('/(app)/(tabs)/plants?filter=needsAttention')}
      className="bg-surface dark:bg-surface-dark rounded-[24px] p-4 mb-4 flex-row items-center gap-3"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Warning icon */}
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{
          backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7',
        }}
      >
        <MaterialIcons name="warning" size={20} color="#F59E0B" />
      </View>

      {/* Text */}
      <Text className="flex-1 text-sm font-bold text-text-primary dark:text-white">
        {t('healthAlert.title', { count: unhealthyCount })}
      </Text>

      {/* Chevron */}
      <MaterialIcons
        name="chevron-right"
        size={20}
        color={iconColors.textMuted}
      />
    </Pressable>
  )
}
