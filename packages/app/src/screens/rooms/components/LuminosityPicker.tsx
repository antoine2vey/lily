import { MaterialIcons } from '@expo/vector-icons'
import {
  LUMINOSITY_LEVELS,
  LUMINOSITY_LUX_VALUES,
  type LuminosityLevel,
  luxToLuminosityLevel,
} from '@lily/shared'
import { Array, Option } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { useIconColors } from 'src/hooks/useIconColors'
import { calculateLuxFromExif } from 'src/utils/luminosity'

const LEVELS: LuminosityLevel[] = [1, 2, 3, 4, 5]

interface LuminosityPickerProps {
  value: number | null
  onChange: (value: number | null) => void
}

export function LuminosityPicker({ value, onChange }: LuminosityPickerProps) {
  const { t } = useTranslation('rooms')
  const iconColors = useIconColors()

  const handleDetectFromPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      exif: true,
      quality: 0.1,
    })

    if (result.canceled || !result.assets[0]) return

    const exif = result.assets[0].exif
    if (!exif) {
      toast.error(t('lightingDetectionFailed'))
      return
    }

    Option.match(calculateLuxFromExif(exif), {
      onNone: () => toast.error(t('lightingDetectionFailed')),
      onSome: (lux) => {
        const level = luxToLuminosityLevel(lux)
        onChange(LUMINOSITY_LUX_VALUES[level])
        toast.success(t('lightingDetected'))
      },
    })
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
        {t('lighting')}
      </Text>
      <View className="flex-row gap-2">
        {Array.map(LEVELS, (level) => {
          const luxValue = LUMINOSITY_LUX_VALUES[level]
          const isSelected = value === luxValue
          const info = LUMINOSITY_LEVELS[level]
          return (
            <Pressable
              key={level}
              onPress={() => onChange(isSelected ? null : luxValue)}
              className={`flex-1 items-center py-2.5 rounded-xl ${
                isSelected
                  ? 'bg-primary/15 border-2 border-primary'
                  : 'bg-surface-tinted dark:bg-slate-700 border-2 border-transparent'
              }`}
            >
              <Text className="text-lg">{info.icon}</Text>
              <Text className="text-[10px] text-text-muted dark:text-slate-400 mt-0.5 text-center">
                {t(`lightingLevels.${level}`)}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Pressable
        onPress={handleDetectFromPhoto}
        className="flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface-tinted dark:bg-slate-700 mt-1"
      >
        <MaterialIcons name="camera-alt" size={16} color={iconColors.primary} />
        <Text className="text-sm font-medium text-primary">
          {t('detectLighting')}
        </Text>
      </Pressable>
      <Text className="text-xs text-text-muted dark:text-slate-400 pl-1">
        {t('lightingHint')}
      </Text>
    </View>
  )
}
