import { MaterialIcons } from '@expo/vector-icons'
import {
  CANOPY_MAX_MEMBERS,
  type Canopy,
  type CanopyMember,
} from '@lily/shared'
import { Array as Arr, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { useRemoveCanopyMember } from '@/hooks/useCanopyMutations'
import { useIconColors } from '@/hooks/useIconColors'
import { CanopySection } from '@/screens/canopy/components/CanopySection'

interface CanopyMembersCardProps {
  canopy: Canopy
  myUserId: string
}

export function CanopyMembersCard({
  canopy,
  myUserId,
}: CanopyMembersCardProps) {
  const { t } = useTranslation('canopy')
  const iconColors = useIconColors()
  const remove = useRemoveCanopyMember()
  const isOwner = canopy.role === 'owner'

  const displayName = (member: CanopyMember) =>
    pipe(
      Option.fromNullishOr(member.name),
      Option.getOrElse(() => t('detail.unnamed'))
    )

  const confirmRemove = (member: CanopyMember) => {
    const name = displayName(member)
    Alert.alert(
      t('detail.removeTitle', { name }),
      t('detail.removeMessage', { name }),
      [
        { text: t('join.notNow'), style: 'cancel' },
        {
          text: t('detail.remove'),
          style: 'destructive',
          onPress: () =>
            remove.mutate(member.userId, {
              onSuccess: () => toast.success(t('detail.removed', { name })),
              onError: () => toast.error(t('detail.failed')),
            }),
        },
      ]
    )
  }

  return (
    <CanopySection
      title={t('detail.members')}
      aside={t('detail.memberCount', {
        count: canopy.members.length,
        max: CANOPY_MAX_MEMBERS,
      })}
    >
      {Arr.map(canopy.members, (member, index) => {
        const isMe = member.userId === myUserId
        return (
          <View
            key={member.userId}
            className={`flex-row items-center px-4 py-3 gap-3 ${
              index < canopy.members.length - 1
                ? 'border-b border-border/40 dark:border-slate-700/40'
                : ''
            }`}
            testID={`canopy-member-${member.userId}`}
          >
            <Avatar
              source={pipe(
                Option.fromNullishOr(member.image),
                Option.map((uri) => ({ uri })),
                Option.getOrUndefined
              )}
              name={displayName(member)}
              size="sm"
            />
            <Text
              className="flex-1 text-base text-text-primary dark:text-white"
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              numberOfLines={1}
            >
              {displayName(member)}
            </Text>
            {isMe && (
              <Badge label={t('detail.you')} variant="neutral" size="sm" />
            )}
            {member.role === 'owner' && (
              <Badge label={t('detail.owner')} variant="success" size="sm" />
            )}
            {isOwner && !isMe && (
              <Pressable
                onPress={() => confirmRemove(member)}
                hitSlop={8}
                accessibilityLabel={`${t('detail.remove')} ${displayName(member)}`}
                testID={`canopy-remove-${member.userId}`}
              >
                <MaterialIcons
                  name="person-remove"
                  size={22}
                  color={iconColors.textMuted}
                />
              </Pressable>
            )}
          </View>
        )
      })}
    </CanopySection>
  )
}
