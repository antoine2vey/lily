import { MaterialIcons } from '@expo/vector-icons'
import type { TemperatureUnit } from '@lily/shared'
import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useIconColors } from '@/hooks/useIconColors'

interface TemperatureUnitOption {
  key: TemperatureUnit
  labelKey: 'celsius' | 'fahrenheit'
  icon: keyof typeof MaterialIcons.glyphMap
}

const TEMPERATURE_UNIT_OPTIONS: TemperatureUnitOption[] = [
  { key: 'celsius', labelKey: 'celsius', icon: 'thermostat' },
  { key: 'fahrenheit', labelKey: 'fahrenheit', icon: 'thermostat' },
]

interface TemperatureUnitModalProps {
  visible: boolean
  onClose: () => void
  currentUnit: TemperatureUnit
  onSelect: (unit: TemperatureUnit) => void
}

export function TemperatureUnitModal({
  visible,
  onClose,
  currentUnit,
  onSelect,
}: TemperatureUnitModalProps) {
  const { t } = useTranslation('settings')
  const iconColors = useIconColors()

  const handleSelect = (unit: TemperatureUnit) => {
    onSelect(unit)
    onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('appearance.temperatureUnitTitle')}
    >
      <View className="py-2">
        {Array.map(TEMPERATURE_UNIT_OPTIONS, ({ key, labelKey, icon }) => (
          <Pressable
            key={key}
            onPress={() => handleSelect(key)}
            className="flex-row items-center py-4 active:opacity-70"
          >
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-primary-tint dark:bg-primary/20">
              <MaterialIcons name={icon} size={20} color={iconColors.primary} />
            </View>
            <Text className="flex-1 text-base font-medium text-text-primary dark:text-white">
              {t(`appearance.${labelKey}`)}
            </Text>
            {currentUnit === key && (
              <MaterialIcons
                name="check"
                size={24}
                color={iconColors.primary}
              />
            )}
          </Pressable>
        ))}
      </View>
      <View className="mt-2 mb-4">
        <Button variant="secondary" onPress={onClose}>
          {t('appearance.temperatureUnitDone')}
        </Button>
      </View>
    </BottomSheet>
  )
}
