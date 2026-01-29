import { Option, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useUpdateProfile } from 'src/hooks/useUpdateProfile'
import { useUser } from 'src/hooks/useUser'
import { iconColors } from 'src/theme'
import { AvatarPicker } from './components/AvatarPicker'
import { BioInput } from './components/BioInput'

export function EditProfileScreen() {
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile()
  const mountedRef = useRef(true)

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setBio(user.bio ?? '')
      setAvatarUri(user.image)
    }
  }, [user])

  const handleCancel = () => {
    router.back()
  }

  const handleSave = () => {
    const isLocalUri = avatarUri !== user?.image

    updateProfile(
      {
        name,
        bio,
        ...(isLocalUri && avatarUri ? { avatarUri } : {}),
      },
      {
        onSuccess: () => {
          if (mountedRef.current) {
            router.back()
          }
        },
        onError: () => {
          if (mountedRef.current) {
            Alert.alert('Error', 'Failed to update profile. Please try again.')
          }
        },
      }
    )
  }

  const handleChangePhoto = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to change your profile picture.'
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri)
    }
  }

  if (isLoadingUser) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            testID="activity-indicator"
            size="large"
            color={iconColors.primary}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleCancel}>
          <Text className="text-base font-regular text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-semibold text-text-primary">
          Edit Profile
        </Text>
        <Pressable onPress={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={iconColors.primary} />
          ) : (
            <Text className="text-base font-semibold text-primary">Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Picker */}
        <AvatarPicker
          avatarUrl={pipe(
            Option.fromNullable(avatarUri),
            Option.flatMap(Option.fromNullable)
          )}
          name={name || 'User'}
          onPress={handleChangePhoto}
        />

        {/* Display Name Input */}
        <View className="mb-4">
          <Text className="text-sm mb-2 font-medium text-text-primary">
            Display Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={iconColors.textMuted}
            className="rounded-xl px-4 py-3.5 bg-input-bg text-base text-text-primary font-regular"
          />
        </View>

        {/* Bio Input */}
        <BioInput value={bio} onChangeText={setBio} maxLength={150} />

        {/* Bottom spacer */}
        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  )
}
