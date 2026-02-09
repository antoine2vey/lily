import { Option, pipe } from 'effect'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, Text, View } from 'react-native'
import { Button } from 'src/components/ui/Button'

interface ConfirmationModalProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  icon?: ReactNode
}

export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  icon,
}: ConfirmationModalProps) {
  const { t } = useTranslation('common')
  const displayConfirmLabel = pipe(
    Option.fromNullable(confirmLabel),
    Option.getOrElse(() => t('buttons.confirm'))
  )
  const displayCancelLabel = pipe(
    Option.fromNullable(cancelLabel),
    Option.getOrElse(() => t('buttons.cancel'))
  )
  const iconBgClass = destructive
    ? 'bg-orange-100 dark:bg-orange-900/20'
    : 'bg-primary-tint dark:bg-primary/20'

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50"
        onPress={onCancel}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-[320px] bg-white dark:bg-surface-dark rounded-3xl p-6 items-center"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 25,
            elevation: 10,
          }}
        >
          {icon && (
            <View
              className={`w-14 h-14 rounded-full items-center justify-center mb-4 ${iconBgClass}`}
            >
              {icon}
            </View>
          )}
          <Text className="text-xl text-center mb-2 text-text-primary dark:text-white font-semibold">
            {title}
          </Text>
          <Text className="text-sm text-center mb-6 text-text-muted dark:text-slate-400 font-regular">
            {message}
          </Text>
          <View className="w-full gap-3">
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onPress={onConfirm}
            >
              {displayConfirmLabel}
            </Button>
            <Pressable
              onPress={onCancel}
              className="h-12 items-center justify-center"
            >
              <Text className="text-base text-text-muted dark:text-slate-400 font-medium">
                {displayCancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
