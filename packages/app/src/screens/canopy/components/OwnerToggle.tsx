import { MaterialIcons } from '@expo/vector-icons'
import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

export type Owner = 'me' | 'canopy'

interface OwnerToggleProps {
  canopyName: string
  value: Owner
  onChange: (owner: Owner) => void
}

// Picks who owns a new plant or room. Shown only to a Canopy member.
export function OwnerToggle({ canopyName, value, onChange }: OwnerToggleProps) {
  const { t } = useTranslation('canopy')
  const iconColors = useIconColors()
  const options: ReadonlyArray<{
    owner: Owner
    label: string
    icon: 'person' | 'groups'
  }> = [
    { owner: 'canopy', label: canopyName, icon: 'groups' },
    { owner: 'me', label: t('add.personal'), icon: 'person' },
  ]

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
        {t('add.label')}
      </Text>
      <View className="flex-row gap-2">
        {Array.map(options, (option) => {
          const isSelected = value === option.owner
          return (
            <Pressable
              key={option.owner}
              testID={`owner-toggle-${option.owner}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange(option.owner)}
              className={`h-9 px-4 rounded-full flex-row items-center gap-1.5 ${
                isSelected
                  ? 'bg-primary'
                  : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
              }`}
            >
              <MaterialIcons
                name={option.icon}
                size={16}
                color={isSelected ? iconColors.white : iconColors.textMuted}
              />
              <Text
                numberOfLines={1}
                className={`text-sm font-medium ${
                  isSelected
                    ? 'text-white'
                    : 'text-text-primary dark:text-white'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
