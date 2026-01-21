import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Image, Pressable, TextInput, View } from 'react-native'
import { iconColors } from 'src/theme'

interface ChatInputProps {
  onSend: (message: string, imageUri?: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
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

  const handleAttachImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setAttachedImage(result.assets[0].uri)
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
    <View className="px-4 py-3 border-t bg-surface border-border">
      {/* Attached Image Preview */}
      {attachedImage && (
        <View className="mb-2 relative">
          <Image
            source={{ uri: attachedImage }}
            className="w-20 h-16 rounded-lg"
            resizeMode="cover"
          />
          <Pressable
            onPress={() => setAttachedImage(null)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center bg-coral"
          >
            <MaterialIcons name="close" size={16} color={iconColors.white} />
          </Pressable>
        </View>
      )}

      <View className="flex-row items-end">
        {/* Camera Button */}
        <Pressable
          onPress={handleTakePhoto}
          className="w-10 h-10 items-center justify-center mr-1"
        >
          <MaterialIcons
            name="camera-alt"
            size={24}
            color={iconColors.primary}
          />
        </Pressable>

        {/* Gallery Button */}
        <Pressable
          onPress={handleAttachImage}
          className="w-10 h-10 items-center justify-center mr-2"
        >
          <MaterialIcons name="photo" size={24} color={iconColors.primary} />
        </Pressable>

        {/* Input */}
        <View className="flex-1 min-h-[44px] max-h-[120px] rounded-2xl px-4 py-2 justify-center bg-input-bg">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Ask about plant care..."
            placeholderTextColor={iconColors.textMuted}
            multiline
            className="font-regular text-base text-text-primary max-h-[100px]"
            editable={!disabled}
          />
        </View>

        {/* Send Button */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          className={`w-10 h-10 rounded-full items-center justify-center ml-2 ${canSend ? 'bg-primary' : 'bg-border'}`}
        >
          <MaterialIcons
            name="send"
            size={20}
            color={canSend ? iconColors.white : iconColors.textMuted}
          />
        </Pressable>
      </View>
    </View>
  )
}
