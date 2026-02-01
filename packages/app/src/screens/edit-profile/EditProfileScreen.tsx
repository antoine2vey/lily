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
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FormInput, FormTextArea } from 'src/components'
import { useIconColors } from 'src/hooks/useIconColors'
import { useUpdateProfile } from 'src/hooks/useUpdateProfile'
import { useUser } from 'src/hooks/useUser'
import { AvatarPicker } from './components/AvatarPicker'

export function EditProfileScreen() {
  const iconColors = useIconColors()
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
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
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
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={['top']}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border/30 dark:border-slate-700/30">
        <Pressable onPress={handleCancel}>
          <Text className="text-base font-medium text-text-muted">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          Edit Profile
        </Text>
        <Pressable onPress={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={iconColors.primary} />
          ) : (
            <Text className="text-base font-bold text-primary">Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
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

        {/* Form Fields */}
        <View className="px-6 gap-6">
          <FormInput
            label="Display Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
          />

          <FormTextArea
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about your plants..."
            maxLength={150}
            showCharacterCount
          />
        </View>

        {/* Bottom spacer */}
        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  )
}
