import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Result } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { GlassCard, GlassLink, MascotHero } from '@/components'
import { Button } from '@/components/ui/Button'
import { useCreateRoom } from '@/hooks/useCreateRoom'
import { useIconColors } from '@/hooks/useIconColors'

interface RoomsStepProps {
  onNext: (data: { roomsCreated: number }) => void
  onSkip: () => void
}

interface RoomPreset {
  id: string
  /** Stored on the room; the rooms, plants and plant-detail screens show it. */
  icon: string
  /** Shown on the chip here. */
  glyph: keyof typeof MaterialIcons.glyphMap
  titleKey: string
  isOutdoor: boolean
}

const ROOM_PRESETS: RoomPreset[] = [
  {
    id: 'living-room',
    icon: '🛋️',
    glyph: 'weekend',
    titleKey: 'rooms.livingRoom',
    isOutdoor: false,
  },
  {
    id: 'bedroom',
    icon: '🛏️',
    glyph: 'bed',
    titleKey: 'rooms.bedroom',
    isOutdoor: false,
  },
  {
    id: 'kitchen',
    icon: '🍳',
    glyph: 'kitchen',
    titleKey: 'rooms.kitchen',
    isOutdoor: false,
  },
  {
    id: 'bathroom',
    icon: '🚿',
    glyph: 'bathtub',
    titleKey: 'rooms.bathroom',
    isOutdoor: false,
  },
  {
    id: 'office',
    icon: '💻',
    glyph: 'computer',
    titleKey: 'rooms.office',
    isOutdoor: false,
  },
  {
    id: 'balcony',
    icon: '🌿',
    glyph: 'balcony',
    titleKey: 'rooms.balcony',
    isOutdoor: true,
  },
]

export function RoomsStep({ onNext, onSkip }: RoomsStepProps) {
  const { t } = useTranslation('onboarding')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const { mutateAsync: createRoom } = useCreateRoom()
  const iconColors = useIconColors()

  const toggleRoom = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleContinue = async () => {
    if (selected.size === 0) return
    setLoading(true)

    const selectedPresets = Arr.filter(ROOM_PRESETS, (p) => selected.has(p.id))

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
      (r) => r.status === 'fulfilled' && Result.isSuccess(r.value)
    ).length

    setLoading(false)
    onNext({ roomsCreated: created })
  }

  return (
    <View className="flex-1">
      <MascotHero
        animation="lookAround"
        title={t('rooms.title')}
        subtitle={t('rooms.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="flex-row flex-wrap gap-2 justify-center">
          {Arr.map(ROOM_PRESETS, (preset) => {
            const isSelected = selected.has(preset.id)
            return (
              <Pressable
                key={preset.id}
                testID={`onboarding-room-${preset.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                onPress={() => toggleRoom(preset.id)}
                className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-full border ${
                  isSelected
                    ? 'bg-primary border-primary-light'
                    : 'bg-white/10 border-white/20 active:bg-white/20'
                }`}
              >
                <MaterialIcons
                  name={preset.glyph}
                  size={18}
                  color={iconColors.white}
                />
                <Text
                  className="text-sm text-white"
                  style={{
                    fontFamily: isSelected
                      ? 'SpaceGrotesk_600SemiBold'
                      : 'SpaceGrotesk_500Medium',
                  }}
                >
                  {t(preset.titleKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View className="gap-2">
          <Button
            onPress={handleContinue}
            disabled={selected.size === 0}
            loading={loading}
            pill
          >
            {t('rooms.create', { count: selected.size })}
          </Button>

          <GlassLink label={t('buttons.skip')} onPress={onSkip} />
        </View>
      </GlassCard>
    </View>
  )
}
