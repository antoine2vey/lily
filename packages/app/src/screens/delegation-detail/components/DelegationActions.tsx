import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { useIconColors } from 'src/hooks/useIconColors'

type DelegationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'active'
  | 'completed'
  | 'canceled'

type UserRole = 'owner' | 'caretaker'

interface DelegationActionsProps {
  status: DelegationStatus
  role: UserRole
  onAccept: () => void
  onReject: () => void
  onCancel: () => void
  onComplete: () => void
  isAccepting: boolean
  isRejecting: boolean
  isCanceling: boolean
  isCompleting: boolean
}

type ModalConfig = {
  visible: boolean
  title: string
  message: string
  confirmLabel: string
  destructive: boolean
  onConfirm: () => void
}

const defaultModal: ModalConfig = {
  visible: false,
  title: '',
  message: '',
  confirmLabel: '',
  destructive: false,
  onConfirm: () => {},
}

export function DelegationActions({
  status,
  role,
  onAccept,
  onReject,
  onCancel,
  onComplete,
  isAccepting,
  isRejecting,
  isCanceling,
  isCompleting,
}: DelegationActionsProps) {
  const { t } = useTranslation('delegations')
  const iconColors = useIconColors()
  const [modal, setModal] = useState<ModalConfig>(defaultModal)

  const showCancelModal = () =>
    setModal({
      visible: true,
      title: t('modals.cancel.title'),
      message: t('modals.cancel.message'),
      confirmLabel: t('modals.cancel.confirm'),
      destructive: true,
      onConfirm: () => {
        onCancel()
        setModal(defaultModal)
      },
    })

  const showRejectModal = () =>
    setModal({
      visible: true,
      title: t('modals.decline.title'),
      message: t('modals.decline.message'),
      confirmLabel: t('modals.decline.confirm'),
      destructive: true,
      onConfirm: () => {
        onReject()
        setModal(defaultModal)
      },
    })

  const showCompleteModal = () =>
    setModal({
      visible: true,
      title: t('modals.complete.title'),
      message: t('modals.complete.message'),
      confirmLabel: t('modals.complete.confirm'),
      destructive: false,
      onConfirm: () => {
        onComplete()
        setModal(defaultModal)
      },
    })

  const actions = pipe(
    Match.value({ status, role }),
    Match.when({ status: 'pending', role: 'caretaker' }, () => (
      <View className="gap-3">
        <Pressable
          onPress={onAccept}
          disabled={isAccepting}
          className="rounded-xl py-4 px-8 items-center bg-primary active:bg-primary-dark"
        >
          {isAccepting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              className="text-white text-base text-center font-semibold"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('actions.acceptRequest')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={showRejectModal}
          disabled={isRejecting}
          className="rounded-xl py-4 px-8 items-center border-2 border-coral/50"
        >
          {isRejecting ? (
            <ActivityIndicator color={iconColors.coral} />
          ) : (
            <Text
              className="text-coral text-base text-center font-semibold"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('actions.decline')}
            </Text>
          )}
        </Pressable>
      </View>
    )),
    Match.when({ status: 'pending', role: 'owner' }, () => (
      <Pressable
        onPress={showCancelModal}
        disabled={isCanceling}
        className="rounded-xl py-4 px-8 items-center border-2 border-coral/50"
      >
        {isCanceling ? (
          <ActivityIndicator color={iconColors.coral} />
        ) : (
          <Text
            className="text-coral text-base text-center font-semibold"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('actions.cancelRequest')}
          </Text>
        )}
      </Pressable>
    )),
    Match.when({ status: 'accepted', role: 'owner' }, () => (
      <Pressable
        onPress={showCancelModal}
        disabled={isCanceling}
        className="rounded-xl py-4 px-8 items-center border-2 border-coral/50"
      >
        {isCanceling ? (
          <ActivityIndicator color={iconColors.coral} />
        ) : (
          <Text
            className="text-coral text-base text-center font-semibold"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {t('actions.cancelDelegation')}
          </Text>
        )}
      </Pressable>
    )),
    Match.when({ status: 'active', role: 'owner' }, () => (
      <View className="gap-3">
        <Pressable
          onPress={showCompleteModal}
          disabled={isCompleting}
          className="rounded-xl py-4 px-8 items-center bg-primary active:bg-primary-dark"
        >
          {isCompleting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              className="text-white text-base text-center font-semibold"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('actions.completeDelegation')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={showCancelModal}
          disabled={isCanceling}
          className="rounded-xl py-4 px-8 items-center border-2 border-coral/50"
        >
          {isCanceling ? (
            <ActivityIndicator color={iconColors.coral} />
          ) : (
            <Text
              className="text-coral text-base text-center font-semibold"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              {t('actions.cancelDelegation')}
            </Text>
          )}
        </Pressable>
      </View>
    )),
    Match.when({ status: 'active', role: 'caretaker' }, () => (
      <View className="p-4 rounded-xl bg-primary-tint dark:bg-primary/10">
        <View className="flex-row items-center">
          <MaterialIcons name="eco" size={20} color={iconColors.primary} />
          <Text className="flex-1 ml-2 text-sm text-primary dark:text-primary-light font-medium">
            {t('actions.caringMessage')}
          </Text>
        </View>
      </View>
    )),
    Match.orElse(() => null)
  )

  return (
    <View>
      {actions}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmLabel={modal.confirmLabel}
        cancelLabel={t('actions.goBack')}
        destructive={modal.destructive}
        onConfirm={modal.onConfirm}
        onCancel={() => setModal(defaultModal)}
        icon={
          modal.destructive ? (
            <MaterialIcons name="warning" size={28} color={iconColors.coral} />
          ) : (
            <MaterialIcons
              name="check-circle"
              size={28}
              color={iconColors.primary}
            />
          )
        }
      />
    </View>
  )
}
