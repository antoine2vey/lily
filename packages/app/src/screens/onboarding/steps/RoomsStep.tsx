import { Array as Arr, Either } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { useCreateRoom } from '@/hooks/useCreateRoom'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface RoomsStepProps {
  onNext: (data: { roomsCreated: number }) => void
  onSkip: () => void
}

interface RoomPreset {
  id: string
  icon: string
  titleKey: string
  isOutdoor: boolean
}

const ROOM_PRESETS: RoomPreset[] = [
  {
    id: 'living-room',
    icon: '🛋️',
    titleKey: 'rooms.livingRoom',
    isOutdoor: false,
  },
  { id: 'bedroom', icon: '🛏️', titleKey: 'rooms.bedroom', isOutdoor: false },
  { id: 'kitchen', icon: '🍳', titleKey: 'rooms.kitchen', isOutdoor: false },
  { id: 'bathroom', icon: '🚿', titleKey: 'rooms.bathroom', isOutdoor: false },
  { id: 'office', icon: '💻', titleKey: 'rooms.office', isOutdoor: false },
  { id: 'balcony', icon: '🌿', titleKey: 'rooms.balcony', isOutdoor: true },
]

export function RoomsStep({ onNext, onSkip }: RoomsStepProps) {
  const { t } = useTranslation('onboarding')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const { mutateAsync: createRoom } = useCreateRoom()

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
      (r) => r.status === 'fulfilled' && Either.isRight(r.value)
    ).length

    setLoading(false)
    onNext({ roomsCreated: created })
  }

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="🏠"
        title={t('rooms.title')}
        subtitle={t('rooms.subtitle')}
      />

      <GlassCard padding="sm">
        <View className="flex-row flex-wrap gap-2 justify-center mb-4">
          {Arr.map(ROOM_PRESETS, (preset) => {
            const isSelected = selected.has(preset.id)
            return (
              <Pressable
                key={preset.id}
                onPress={() => toggleRoom(preset.id)}
                className={`flex-row items-center px-4 py-3 rounded-full ${
                  isSelected ? 'bg-white/25' : 'bg-white/10'
                }`}
              >
                <Text className="text-base mr-1.5">{preset.icon}</Text>
                <Text
                  className={`text-sm ${isSelected ? 'text-white' : 'text-white/70'}`}
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

        <Button
          onPress={handleContinue}
          disabled={selected.size === 0}
          loading={loading}
          pill
        >
          {t('rooms.create', { count: selected.size })}
        </Button>

        <Pressable onPress={onSkip} className="mt-3 py-2 items-center">
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('buttons.skip')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
