import { MaterialIcons } from '@expo/vector-icons'
import { DateTime, Duration, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { ListRow } from 'src/components/ListRow'
import { useIconColors } from 'src/hooks/useIconColors'

interface PastCareSheetProps {
  visible: boolean
  onClose: () => void
  onSelect: (date: Date) => void
}

export function PastCareSheet({
  visible,
  onClose,
  onSelect,
}: PastCareSheetProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()

  const handleSelect = (daysAgo: number) => () => {
    const pastDate = pipe(
      DateTime.unsafeNow(),
      DateTime.subtractDuration(Duration.days(daysAgo)),
      DateTime.toDateUtc
    )
    onClose()
    onSelect(pastDate)
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['60%']}>
      <View className="pb-2">
        <Text className="text-lg text-center font-semibold text-text-primary dark:text-white">
          {t('detail.pastCare.title')}
        </Text>
      </View>

      <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.yesterday')}
          onPress={handleSelect(1)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.twoDaysAgo')}
          onPress={handleSelect(2)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.threeDaysAgo')}
          onPress={handleSelect(3)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.fourDaysAgo')}
          onPress={handleSelect(4)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.fiveDaysAgo')}
          onPress={handleSelect(5)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.sixDaysAgo')}
          onPress={handleSelect(6)}
        />
        <ListRow
          leftIcon={
            <MaterialIcons
              name="history"
              size={20}
              color={iconColors.primary}
            />
          }
          title={t('detail.pastCare.oneWeekAgo')}
          onPress={handleSelect(7)}
        />
      </ScrollView>
    </BottomSheet>
  )
}
