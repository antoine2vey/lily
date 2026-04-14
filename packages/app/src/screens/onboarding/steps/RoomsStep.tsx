import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Either } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useCreateRoom } from '@/hooks/useCreateRoom'
import { useIconColors } from '@/hooks/useIconColors'

interface RoomsStepProps {
  onNext: (data: { roomsCreated: number }) => void
  onSkip: () => void
}

interface RoomPreset {
  name: string
  icon: string
  titleKey: string
  isOutdoor: boolean
}

const ROOM_PRESETS: RoomPreset[] = [
  {
    name: 'Living Room',
    icon: '🛋️',
    titleKey: 'rooms.livingRoom',
    isOutdoor: false,
  },
  {
    name: 'Bedroom',
    icon: '🛏️',
    titleKey: 'rooms.bedroom',
    isOutdoor: false,
  },
  {
    name: 'Kitchen',
    icon: '🍳',
    titleKey: 'rooms.kitchen',
    isOutdoor: false,
  },
  {
    name: 'Bathroom',
    icon: '🚿',
    titleKey: 'rooms.bathroom',
    isOutdoor: false,
  },
  {
    name: 'Office',
    icon: '💻',
    titleKey: 'rooms.office',
    isOutdoor: false,
  },
  {
    name: 'Balcony',
    icon: '🌿',
    titleKey: 'rooms.balcony',
    isOutdoor: true,
  },
]

export function RoomsStep({ onNext, onSkip }: RoomsStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const { mutateAsync: createRoom } = useCreateRoom()

  const toggleRoom = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const handleContinue = async () => {
    if (selected.size === 0) return

    setLoading(true)

    const selectedPresets = Arr.filter(ROOM_PRESETS, (p) =>
      selected.has(p.name)
    )

    const results = await Promise.allSettled(
      Arr.map(selectedPresets, (preset) =>
        createRoom({
          payload: {
            name: t(preset.titleKey),
            icon: preset.icon,
            isOutdoor: preset.isOutdoor,
          },
        })
      )
    )

    const created = Arr.filter(
      results,
      (r) => r.status === 'fulfilled' && Either.isRight(r.value)
    ).length

    setLoading(false)
    onNext({ roomsCreated: created })
  }

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-primary-tint dark:bg-slate-800">
          <MaterialIcons name="room" size={80} color={iconColors.primary} />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('rooms.title')}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-8">
        {t('rooms.subtitle')}
      </Text>

      <View className="flex-row flex-wrap gap-3 justify-center">
        {ROOM_PRESETS.map((preset) => {
          const isSelected = selected.has(preset.name)
          return (
            <Pressable
              key={preset.name}
              onPress={() => toggleRoom(preset.name)}
              className={`flex-row items-center px-4 py-3 rounded-full border ${
                isSelected
                  ? 'border-primary bg-primary-tint dark:bg-slate-700'
                  : 'border-border dark:border-slate-700 bg-surface dark:bg-slate-800'
              }`}
            >
              <Text className="text-lg mr-2">{preset.icon}</Text>
              <Text
                className={`text-sm ${
                  isSelected
                    ? 'font-semibold text-primary dark:text-primary-light'
                    : 'text-text-primary dark:text-white'
                }`}
                style={{
                  fontFamily: isSelected
                    ? 'SpaceGrotesk_600SemiBold'
                    : 'SpaceGrotesk_400Regular',
                }}
              >
                {t(preset.titleKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View className="gap-3 mt-auto mb-4">
        <Pressable
          onPress={handleContinue}
          disabled={selected.size === 0 || loading}
          className={`flex-row items-center justify-center py-4 rounded-full ${
            selected.size > 0
              ? 'bg-primary active:bg-primary-dark'
              : 'bg-border dark:bg-slate-700'
          }`}
        >
          {loading ? (
            <ActivityIndicator size="small" color={iconColors.white} />
          ) : (
            <Text
              className={`text-base font-semibold ${
                selected.size > 0 ? 'text-white' : 'text-text-muted'
              }`}
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('rooms.create', { count: selected.size })}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={onSkip} className="py-3 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-500">
            {t('buttons.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
