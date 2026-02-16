import { MaterialIcons } from '@expo/vector-icons'
import { Match, pipe } from 'effect'
import { useState } from 'react'
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
  const iconColors = useIconColors()
  const [modal, setModal] = useState<ModalConfig>(defaultModal)

  const showCancelModal = () =>
    setModal({
      visible: true,
      title: 'Cancel Delegation',
      message:
        'Are you sure you want to cancel this delegation? This action cannot be undone.',
      confirmLabel: 'Cancel Delegation',
      destructive: true,
      onConfirm: () => {
        onCancel()
        setModal(defaultModal)
      },
    })

  const showRejectModal = () =>
    setModal({
      visible: true,
      title: 'Decline Request',
      message: 'Are you sure you want to decline this care request?',
      confirmLabel: 'Decline',
      destructive: true,
      onConfirm: () => {
        onReject()
        setModal(defaultModal)
      },
    })

  const showCompleteModal = () =>
    setModal({
      visible: true,
      title: 'Complete Delegation',
      message:
        'Mark this delegation as completed? The caretaker will be notified.',
      confirmLabel: 'Complete',
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
              Accept Request
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
              Decline
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
            Cancel Request
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
            Cancel Delegation
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
              Complete Delegation
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
              Cancel Delegation
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
            You are currently caring for these plants
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
        cancelLabel="Go Back"
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
