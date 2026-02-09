import { type DateInput, formatMemberSince, parseApiDate } from '@lily/shared'
import { Option, pipe, String } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'

interface ProfileHeaderProps {
  avatarUrl: Option.Option<string>
  name: string
  username?: string
  memberSince: DateInput
}

export function ProfileHeader({
  avatarUrl,
  name,
  username,
  memberSince,
}: ProfileHeaderProps) {
  const { t, i18n } = useTranslation('profile')
  const memberSinceFormatted = pipe(
    parseApiDate(memberSince),
    Option.map((dt) => formatMemberSince(dt, i18n.language)),
    Option.getOrElse(() => t('memberSinceUnknown'))
  )

  return (
    <View className="items-center pt-2 pb-4">
      <View className="w-20 h-20 rounded-full p-1 border-2 border-primary bg-surface dark:bg-surface-dark mb-3">
        {pipe(
          avatarUrl,
          Option.match({
            onNone: () => (
              <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
                <Text className="text-2xl font-bold text-primary">
                  {pipe(
                    name,
                    String.charAt(0),
                    Option.map(String.toUpperCase),
                    Option.getOrElse(() => '')
                  )}
                </Text>
              </View>
            ),
            onSome: (url) => (
              <AnimatedImage
                source={{ uri: url }}
                className="w-full h-full"
                rounded
              />
            ),
          })
        )}
      </View>

      <Text className="text-xl font-bold text-text-primary dark:text-white">
        {name}
      </Text>

      {username && (
        <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
          @{username}
        </Text>
      )}

      <View className="mt-3 px-3 py-1 bg-surface dark:bg-surface-dark border border-border/50 dark:border-slate-700/50 rounded-full">
        <Text className="text-xs font-semibold text-text-muted dark:text-slate-400 tracking-wide">
          {t('memberSince', { date: memberSinceFormatted })}
        </Text>
      </View>
    </View>
  )
}
