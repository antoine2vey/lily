import { MaterialIcons } from '@expo/vector-icons'
import { formatShortDate, parseApiDate } from '@lily/shared'
import { Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useIconColors } from '@/hooks/useIconColors'
import { DelegationStatusBadge } from '@/screens/delegation-detail/components/DelegationStatusBadge'

interface DelegationListItem {
  id: string
  ownerId: string
  ownerName: string | null
  ownerImage: string | null
  caretakerId: string
  caretakerName: string | null
  caretakerImage: string | null
  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'active'
    | 'completed'
    | 'canceled'
  startDate: Date
  endDate: Date
  plantCount: number
  createdAt: Date
}

interface DelegationCardProps {
  delegation: DelegationListItem
  onPress: () => void
}

export function DelegationCard({ delegation, onPress }: DelegationCardProps) {
  const { t } = useTranslation('delegations')
  const iconColors = useIconColors()
  const { state: authState } = useAuth()

  const currentUserId =
    authState._tag === 'Authenticated' ? authState.user.id : ''

  const isOwner = delegation.ownerId === currentUserId

  const otherPersonName = isOwner
    ? pipe(
        Option.fromNullable(delegation.caretakerName),
        Option.getOrElse(() => t('card.unknown'))
      )
    : pipe(
        Option.fromNullable(delegation.ownerName),
        Option.getOrElse(() => t('card.unknown'))
      )

  const otherPersonImage = isOwner
    ? delegation.caretakerImage
    : delegation.ownerImage

  const roleLabel = isOwner ? t('card.caretaker') : t('card.owner')

  const startDateFormatted = pipe(
    parseApiDate(delegation.startDate),
    Option.map(formatShortDate),
    Option.getOrElse(() => t('detail.unknownDate'))
  )

  const endDateFormatted = pipe(
    parseApiDate(delegation.endDate),
    Option.map(formatShortDate),
    Option.getOrElse(() => t('detail.unknownDate'))
  )

  return (
    <Pressable
      onPress={onPress}
      className="p-4 rounded-xl bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30 shadow-sm active:bg-surface-tinted dark:active:bg-slate-700"
    >
      <View className="flex-row items-start justify-between mb-3">
        <DelegationStatusBadge status={delegation.status} />
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={iconColors.border}
        />
      </View>

      <View className="flex-row items-center">
        <Avatar
          source={pipe(
            Option.fromNullable(otherPersonImage),
            Option.map((uri) => ({ uri })),
            Option.getOrUndefined
          )}
          name={otherPersonName}
          size="md"
        />
        <View className="flex-1 ml-3">
          <Text className="text-[10px] uppercase font-medium text-text-muted dark:text-slate-400">
            {roleLabel}
          </Text>
          <Text
            className="text-sm font-semibold text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            numberOfLines={1}
          >
            {otherPersonName}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mt-3 gap-4">
        <View className="flex-row items-center">
          <MaterialIcons
            name="calendar-today"
            size={14}
            color={iconColors.textMuted}
          />
          <Text className="text-xs ml-1 text-text-muted dark:text-slate-400">
            {startDateFormatted} - {endDateFormatted}
          </Text>
        </View>
        <View className="flex-row items-center">
          <MaterialIcons name="eco" size={14} color={iconColors.primary} />
          <Text className="text-xs ml-1 text-text-muted dark:text-slate-400">
            {t('card.plantCount', { count: delegation.plantCount })}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}
