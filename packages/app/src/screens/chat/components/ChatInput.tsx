import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIconColors } from 'src/hooks/useIconColors'

interface ChatInputProps {
  onSend: (message: string, imageUri?: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)

  const handleSend = () => {
    const trimmedMessage = message.trim()
    if (trimmedMessage || attachedImage) {
      onSend(trimmedMessage, attachedImage ?? undefined)
      setMessage('')
      setAttachedImage(null)
    }
  }

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setAttachedImage(result.assets[0].uri)
    }
  }

  const canSend = (message.trim().length > 0 || attachedImage) && !disabled

  return (
    <View
      className="px-4 pt-2 border-t bg-background/95 dark:bg-background-dark/95 border-border/30 dark:border-slate-700/30"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
    >
      {/* Attached Image Preview */}
      {attachedImage && (
        <View className="mb-3 flex-row items-start p-3 bg-surface dark:bg-surface-dark rounded-xl border border-border/50 dark:border-slate-700/50">
          <View className="relative">
            <Image
              source={{ uri: attachedImage }}
              className="w-20 h-20 rounded-lg"
              resizeMode="cover"
            />
            <Pressable
              onPress={() => setAttachedImage(null)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center bg-coral border-2 border-white"
            >
              <MaterialIcons name="close" size={14} color={iconColors.white} />
            </Pressable>
          </View>
          <View className="ml-3 justify-center h-20">
            <Text className="text-sm font-semibold text-text-primary dark:text-white">
              {t('input.imageAttached')}
            </Text>
            <View className="flex-row items-center gap-1 mt-1">
              <MaterialIcons
                name="auto-awesome"
                size={14}
                color={iconColors.primary}
              />
              <Text className="text-xs text-primary font-medium">
                {t('input.analysisReady')}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View className="flex-row items-end gap-2">
        {/* Camera Button */}
        <Pressable
          onPress={handleTakePhoto}
          className="w-12 h-12 items-center justify-center rounded-full bg-surface dark:bg-surface-dark border border-border dark:border-slate-700 mb-0.5"
        >
          <MaterialIcons
            name="add-a-photo"
            size={24}
            color={iconColors.textMuted}
          />
        </Pressable>

        {/* Input Container with Send Button inside */}
        <View className="flex-1 flex-row items-end bg-surface dark:bg-surface-dark rounded-3xl border border-border/50 dark:border-slate-700/50 py-1 pl-4 pr-1.5">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t('input.placeholder')}
            placeholderTextColor={iconColors.textMuted}
            multiline
            className="flex-1 font-regular text-base text-text-primary dark:text-white py-3 max-h-32"
            editable={!disabled}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={`w-10 h-10 rounded-full items-center justify-center ml-2 mb-0.5 ${canSend ? 'bg-primary' : 'bg-border'}`}
          >
            <MaterialIcons
              name="arrow-upward"
              size={22}
              color={canSend ? iconColors.white : iconColors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  )
}
