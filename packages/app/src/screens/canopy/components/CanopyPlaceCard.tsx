import { MaterialIcons } from '@expo/vector-icons'
import type { Canopy, UpdateCanopyRequest } from '@lily/shared'
import { Array as Arr, Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { toast } from 'sonner-native'
import { useUpdateCanopy } from '@/hooks/useCanopyMutations'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocationPermission } from '@/hooks/useLocationPermission'
import { CanopySection } from '@/screens/canopy/components/CanopySection'
import {
  TIMEZONE_OPTIONS,
  TimezonePickerModal,
} from '@/screens/notification-settings/components/TimezonePickerModal'
import type { ApiFailure } from '@/utils/client'
import { getDeviceTimezone } from '@/utils/notifications'

const timezoneLabel = (timezone: string) =>
  pipe(
    Arr.findFirst(TIMEZONE_OPTIONS, (option) => option.value === timezone),
    Option.map((option) => option.label),
    Option.getOrElse(() => timezone)
  )

/** The Canopy's own time zone and location. Every member sees them; only the owner edits. */
export function CanopyPlaceCard({ canopy }: { canopy: Canopy }) {
  const { t } = useTranslation('canopy')
  const iconColors = useIconColors()
  const update = useUpdateCanopy()
  const { requestPermission, loading: locating } = useLocationPermission()
  const [pickingTimezone, setPickingTimezone] = useState(false)
  const isOwner = canopy.role === 'owner'
  const hasLocation = canopy.latitude !== null && canopy.longitude !== null

  const save = (payload: UpdateCanopyRequest) =>
    update.mutate(payload, {
      onSuccess: () => toast.success(t('detail.place.updated')),
      onError: (error: ApiFailure) =>
        toast.error(
          error._tag === 'NotCanopyOwnerError'
            ? t('detail.notOwner')
            : t('detail.failed')
        ),
    })

  const setFromCurrentLocation = async () => {
    const location = await requestPermission()
    if (location === null) {
      toast.error(t('detail.place.locationDenied'))
      return
    }
    save(location)
  }

  return (
    <CanopySection title={t('detail.place.title')}>
      <Pressable
        disabled={!isOwner}
        onPress={() => setPickingTimezone(true)}
        className="flex-row items-center px-4 py-3.5 border-b border-border/40 dark:border-slate-700/40"
        testID="canopy-timezone-row"
      >
        <MaterialIcons name="schedule" size={22} color={iconColors.primary} />
        <Text className="flex-1 ml-3 text-base text-text-primary dark:text-white">
          {t('detail.place.timezone')}
        </Text>
        <Text className="text-sm text-text-muted dark:text-slate-400">
          {timezoneLabel(canopy.timezone)}
        </Text>
        {isOwner && (
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={iconColors.textMuted}
          />
        )}
      </Pressable>
      <View className="flex-row items-center px-4 py-3.5">
        <MaterialIcons name="place" size={22} color={iconColors.primary} />
        <Text className="flex-1 ml-3 text-base text-text-primary dark:text-white">
          {t('detail.place.location')}
        </Text>
        <Text className="text-sm text-text-muted dark:text-slate-400">
          {hasLocation
            ? t('detail.place.locationSet')
            : t('detail.place.locationNotSet')}
        </Text>
      </View>
      <View className="px-4 pb-4 gap-3">
        {isOwner ? (
          <View className="flex-row flex-wrap gap-x-5 gap-y-2">
            <Pressable
              onPress={() => save({ timezone: getDeviceTimezone() })}
              hitSlop={6}
            >
              <Text className="text-sm font-medium text-primary">
                {t('detail.place.useDeviceTimezone')}
              </Text>
            </Pressable>
            <Pressable
              onPress={setFromCurrentLocation}
              disabled={locating}
              hitSlop={6}
            >
              <Text className="text-sm font-medium text-primary">
                {t('detail.place.useLocation')}
              </Text>
            </Pressable>
            {hasLocation && (
              <Pressable
                onPress={() => save({ latitude: null, longitude: null })}
                hitSlop={6}
              >
                <Text className="text-sm font-medium text-coral">
                  {t('detail.place.clearLocation')}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        <Text className="text-xs leading-relaxed text-text-muted dark:text-slate-400">
          {t('detail.place.ownerOnly')}
        </Text>
      </View>
      {isOwner && (
        <TimezonePickerModal
          visible={pickingTimezone}
          onClose={() => setPickingTimezone(false)}
          selectedTimezone={canopy.timezone}
          onTimezoneChange={(timezone) => {
            setPickingTimezone(false)
            save({ timezone })
          }}
        />
      )}
    </CanopySection>
  )
}
