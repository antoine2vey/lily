import { LiquidGlassView } from '@callstack/liquid-glass'
import { Option, pipe } from 'effect'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { GlassBackButton } from '@/components/GlassBackButton'
import { GlassIconButton } from '@/components/GlassIconButton'
import { useIconColors } from '@/hooks/useIconColors'
import { useGlass } from '@/utils/glass'

function TitlePill({
  twoLines,
  children,
}: {
  twoLines: boolean
  children: ReactNode
}) {
  const height = twoLines ? 44 : 40
  if (useGlass) {
    return (
      <LiquidGlassView
        interactive={false}
        style={{
          height,
          borderRadius: height / 2,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </LiquidGlassView>
    )
  }
  return (
    <View
      className="px-4 items-center justify-center rounded-full bg-white dark:bg-surface-dark"
      style={{ height }}
    >
      {children}
    </View>
  )
}

interface AskLilyHeaderProps {
  onMenuPress: () => void
  subtitle?: string | undefined
}

export function AskLilyHeader({ onMenuPress, subtitle }: AskLilyHeaderProps) {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()
  const subtitleOption = Option.fromNullishOr(subtitle)

  return (
    <View pointerEvents="box-none" className="flex-row items-center px-4 py-2">
      <View className="w-10">
        <GlassBackButton testID="chat-back-button" />
      </View>

      <View pointerEvents="box-none" className="flex-1 items-center px-3">
        <TitlePill twoLines={Option.isSome(subtitleOption)}>
          <Text
            className="text-base text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('header.assistantName')}
          </Text>
          {pipe(
            subtitleOption,
            Option.match({
              onNone: () => null,
              onSome: (text) => (
                <Text
                  numberOfLines={1}
                  className="text-xs font-regular text-text-muted dark:text-slate-400"
                >
                  {text}
                </Text>
              ),
            })
          )}
        </TitlePill>
      </View>

      <View className="w-10">
        <GlassIconButton
          testID="chat-menu-button"
          icon="menu"
          accessibilityLabel={t('drawer.title')}
          iconColor={iconColors.textPrimary}
          onPress={onMenuPress}
        />
      </View>
    </View>
  )
}
