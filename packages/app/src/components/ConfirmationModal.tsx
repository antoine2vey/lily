import type { ReactNode } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'
import { Button } from './ui/Button'

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
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  icon,
}: ConfirmationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onPress={onCancel}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-[320px] bg-white rounded-3xl p-6 items-center"
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
              className="w-14 h-14 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: destructive ? '#FDECEC' : colors.primaryTint,
              }}
            >
              {icon}
            </View>
          )}
          <Text
            className="text-xl text-center mb-2"
            style={{ fontFamily: fonts.semiBold, color: colors.textPrimary }}
          >
            {title}
          </Text>
          <Text
            className="text-sm text-center mb-6"
            style={{ fontFamily: fonts.regular, color: colors.textMuted }}
          >
            {message}
          </Text>
          <View className="w-full gap-3">
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onPress={onConfirm}
            >
              {confirmLabel}
            </Button>
            <Pressable
              onPress={onCancel}
              className="h-12 items-center justify-center"
            >
              <Text
                style={{
                  fontFamily: fonts.medium,
                  color: colors.textMuted,
                  fontSize: 16,
                }}
              >
                {cancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
