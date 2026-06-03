import { Option, pipe } from 'effect'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { FormInput, FormTextArea } from '@/components'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useIconColors } from '@/hooks/useIconColors'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useUser } from '@/hooks/useUser'
import { AvatarPicker } from '@/screens/edit-profile/components/AvatarPicker'
import { EditProfileSkeleton } from '@/screens/edit-profile/components/EditProfileSkeleton'

export function EditProfileScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const iconColors = useIconColors()
  const { data: user, isLoading: isLoadingUser } = useUser()
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile()
  const mountedRef = useRef(true)

  const isInitialLoading = isLoadingUser && !user
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const [name, setName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined)
  const [firstNameError, setFirstNameError] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (user) {
      setName(Option.getOrElse(Option.fromNullable(user.name), () => ''))
      setFirstName(
        Option.getOrElse(Option.fromNullable(user.firstName), () => '')
      )
      setLastName(
        Option.getOrElse(Option.fromNullable(user.lastName), () => '')
      )
      setBio(Option.getOrElse(Option.fromNullable(user.bio), () => ''))
      setAvatarUri(user.image)
    }
  }, [user])

  const handleCancel = () => {
    router.back()
  }

  const handleSave = () => {
    // firstName is the only required field on profile edit.
    if (firstName.trim().length === 0) {
      setFirstNameError(t('profile:edit.firstNameRequired'))
      return
    }
    setFirstNameError(null)

    const isLocalUri = avatarUri !== user?.image
    const trimmedLast = lastName.trim()

    updateProfile(
      {
        name,
        bio,
        firstName: firstName.trim(),
        // Empty string clears the existing last name on the server.
        lastName: trimmedLast.length > 0 ? trimmedLast : null,
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
            Alert.alert(t('common:errors.generic'), t('profile:edit.error'))
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
        t('profile:edit.permissionRequired'),
        t('profile:edit.permissionMessage')
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

  if (showSkeleton) {
    return (
      <Animated.View entering={FadeIn.duration(300)} className="flex-1">
        <EditProfileSkeleton />
      </Animated.View>
    )
  }

  if (isInitialLoading) {
    return null
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border/30 dark:border-slate-700/30">
        <Pressable onPress={handleCancel}>
          <Text className="text-base font-medium text-text-muted">
            {t('common:buttons.cancel')}
          </Text>
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('profile:edit.title')}
        </Text>
        <Pressable onPress={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={iconColors.primary} />
          ) : (
            <Text className="text-base font-bold text-primary">
              {t('common:buttons.save')}
            </Text>
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
          name={name || t('profile:defaultName')}
          onPress={handleChangePhoto}
        />

        {/* Form Fields */}
        <View className="px-6 gap-6">
          <FormInput
            label={t('profile:edit.firstNameLabel')}
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v)
              if (firstNameError) setFirstNameError(null)
            }}
            placeholder={t('profile:edit.firstNamePlaceholder')}
            {...(firstNameError ? { error: firstNameError } : {})}
          />

          <FormInput
            label={t('profile:edit.lastNameLabel')}
            value={lastName}
            onChangeText={setLastName}
            placeholder={t('profile:edit.lastNamePlaceholder')}
          />

          <FormInput
            label={t('profile:edit.displayNameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('profile:edit.displayNamePlaceholder')}
          />

          <FormTextArea
            label={t('profile:edit.bioLabel')}
            value={bio}
            onChangeText={setBio}
            placeholder={t('profile:edit.bioPlaceholder')}
            maxLength={150}
            showCharacterCount
          />
        </View>
      </ScrollView>
    </Animated.View>
  )
}
