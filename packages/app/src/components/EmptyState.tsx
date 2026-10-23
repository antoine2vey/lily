import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import type { MascotAnimation } from '@/assets/mascot'
import { Mascot } from '@/components/Mascot'
import { Button } from '@/components/ui/Button'
import type copy from '@/i18n/locales/en/emptyStates'

export type EmptyStateKind = keyof typeof copy

/** The mascot clip for every empty state; its copy lives in the `emptyStates` namespace. */
const clips = {
  homeNoPlants: 'hello',
  careAllCaughtUp: 'sunbathing',
  plantsNone: 'jump',
  plantsNoResults: 'lookAround',
  plantScheduleClear: 'sunbathing',
  plantPhotos: 'scan',
  careHistory: 'rainy',
  careHistoryFiltered: 'lookAround',
  recentActivity: 'rainy',
  notifications: 'bell',
  cemetery: 'celebrate',
  rooms: 'lookAround',
  roomsAllAssigned: 'celebrate',
  delegationsAll: 'sendEnvelope',
  delegationsOwner: 'sendEnvelope',
  delegationsCaretaker: 'sendEnvelope',
  delegationPlants: 'lookAround',
  delegationPickPlants: 'jump',
  followers: 'hello',
  following: 'lookAround',
  usersNoResults: 'lookAround',
  usersNoSuggestions: 'hello',
  publicProfilePlants: 'lookAround',
  profileUnavailable: 'rainy',
  chatNew: 'hello',
  conversations: 'hello',
  timezonesNoResults: 'lookAround',
} as const satisfies Record<EmptyStateKind, MascotAnimation>

const variants = {
  screen: {
    container: 'flex-1 items-center justify-center px-6 py-8',
    mascotSize: 168,
    title: 'text-2xl',
    description: 'text-base max-w-[300px]',
  },
  inline: {
    container: 'items-center px-4 py-4',
    mascotSize: 96,
    title: 'text-base',
    description: 'text-sm max-w-[260px]',
  },
} as const

interface EmptyStateProps {
  kind: EmptyStateKind
  action?:
    | {
        label: string
        onPress: () => void
      }
    | undefined
  /** `screen` fills the screen; `inline` sits inside a card, section or sheet. */
  variant?: keyof typeof variants
  testID?: string | undefined
}

export function EmptyState({
  kind,
  action,
  variant = 'screen',
  testID,
}: EmptyStateProps) {
  const { t } = useTranslation('emptyStates')
  const style = variants[variant]

  return (
    <View className={style.container} testID={testID}>
      <Mascot animation={clips[kind]} size={style.mascotSize} />
      <Text
        className={`${style.title} text-center mt-2 text-text-primary dark:text-white`}
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {t(`${kind}.title`)}
      </Text>
      <Text
        className={`${style.description} text-center mt-1.5 leading-relaxed text-text-secondary dark:text-slate-400`}
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        {t(`${kind}.description`)}
      </Text>
      {action && (
        <View className="w-full mt-6">
          <Button onPress={action.onPress}>{action.label}</Button>
        </View>
      )}
    </View>
  )
}
