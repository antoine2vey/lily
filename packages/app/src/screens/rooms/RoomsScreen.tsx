import { MaterialIcons } from '@expo/vector-icons'
import {
  LUMINOSITY_LEVELS,
  type LuminosityLevel,
  type Plant,
} from '@lily/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Either, Option, pipe, String } from 'effect'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { ConfirmationModal } from 'src/components/ConfirmationModal'
import { EmptyState } from 'src/components/EmptyState'
import { SkeletonBox } from 'src/components/skeletons'
import { Input } from 'src/components/ui/Input'
import { useCreateRoom } from 'src/hooks/useCreateRoom'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useDeleteRoom } from 'src/hooks/useDeleteRoom'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlants } from 'src/hooks/usePlants'
import { useRooms } from 'src/hooks/useRooms'
import { useUpdateRoom } from 'src/hooks/useUpdateRoom'
import { EmojiPicker } from 'src/screens/rooms/components/EmojiPicker'
import { LuminosityPicker } from 'src/screens/rooms/components/LuminosityPicker'
import { PlantSelector } from 'src/screens/rooms/components/PlantSelector'
import { apiEffectRunner } from 'src/utils/client'
import { queryKeys } from 'src/utils/query-keys'

interface RoomFormState {
  name: string
  icon: string
  luminosity: number | null
}

const DEFAULT_FORM: RoomFormState = { name: '', icon: '🏠', luminosity: null }

function RoomCardSkeleton() {
  return (
    <View className="flex-row items-center p-4 mb-2 bg-surface dark:bg-surface-dark rounded-xl">
      <SkeletonBox width={32} height={32} rounded="sm" />
      <View className="flex-1 ml-3">
        <SkeletonBox width="50%" height={16} rounded="sm" />
        <View className="flex-row items-center gap-2 mt-1.5">
          <SkeletonBox width={70} height={14} rounded="sm" />
          <SkeletonBox width={90} height={14} rounded="sm" />
        </View>
      </View>
      <SkeletonBox width={20} height={20} rounded="sm" />
    </View>
  )
}

function RoomsContentSkeleton() {
  return (
    <View className="px-4">
      <RoomCardSkeleton />
      <RoomCardSkeleton />
      <RoomCardSkeleton />
      <RoomCardSkeleton />
    </View>
  )
}

export function RoomsScreen() {
  const { t } = useTranslation('rooms')
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const iconColors = useIconColors()
  const queryClient = useQueryClient()

  const { data: rooms, isLoading } = useRooms()
  const { data: plantsData } = usePlants({ limit: '200' })
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const deleteRoom = useDeleteRoom()

  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [deletingRoom, setDeletingRoom] = useState<{
    id: string
    name: string
  } | null>(null)
  const [form, setForm] = useState<RoomFormState>(DEFAULT_FORM)
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(
    new Set()
  )
  const initialPlantIdsRef = useRef<Set<string>>(new Set())

  const allPlants = pipe(
    Option.fromNullable(plantsData),
    Option.map((d) => d.items),
    Option.getOrElse(() => [] as readonly Plant[])
  )

  const availablePlantsForCreate = useMemo(
    () => Array.filter(allPlants, (p) => p.roomId === null),
    [allPlants]
  )

  const availablePlantsForEdit = useMemo(
    () =>
      Array.filter(
        allPlants,
        (p) => p.roomId === null || p.roomId === editingRoomId
      ),
    [allPlants, editingRoomId]
  )

  const handleTogglePlant = useCallback((id: string) => {
    setSelectedPlantIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const updatePlantRoomAssignments = useCallback(
    async (roomId: string, initialIds: Set<string>) => {
      const added = Array.filter(
        [...selectedPlantIds],
        (id) => !initialIds.has(id)
      )
      const removed = Array.filter(
        [...initialIds],
        (id) => !selectedPlantIds.has(id)
      )

      const updates = [
        ...Array.map(added, (plantId) =>
          apiEffectRunner('plants', 'updatePlant', {
            path: { id: plantId },
            payload: { roomId },
          })
        ),
        ...Array.map(removed, (plantId) =>
          apiEffectRunner('plants', 'updatePlant', {
            path: { id: plantId },
            payload: { roomId: null },
          })
        ),
      ]

      if (!Array.isEmptyReadonlyArray(updates)) {
        await Promise.all(updates)
        queryClient.invalidateQueries({ queryKey: queryKeys.plants.lists() })
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all })
      }
    },
    [selectedPlantIds, queryClient]
  )

  const handleOpenCreate = useCallback(() => {
    setForm(DEFAULT_FORM)
    setSelectedPlantIds(new Set())
    setShowCreateSheet(true)
  }, [])

  const handleOpenEdit = useCallback(
    (room: {
      id: string
      name: string
      icon: string
      luminosity: number | null
    }) => {
      setEditingRoomId(room.id)
      setForm({ name: room.name, icon: room.icon, luminosity: room.luminosity })
      const plantsInRoom = Array.filter(allPlants, (p) => p.roomId === room.id)
      const ids = new Set(Array.map(plantsInRoom, (p) => p.id))
      setSelectedPlantIds(ids)
      initialPlantIdsRef.current = new Set(ids)
      setShowEditSheet(true)
    },
    [allPlants]
  )

  const handleOpenDelete = useCallback((room: { id: string; name: string }) => {
    setDeletingRoom(room)
    setShowDeleteConfirm(true)
  }, [])

  const handleCreate = useCallback(() => {
    if (String.isEmpty(String.trim(form.name))) return
    createRoom.mutate(
      {
        payload: {
          name: form.name,
          icon: form.icon,
          ...(form.luminosity != null ? { luminosity: form.luminosity } : {}),
        },
      },
      {
        onSuccess: (result) => {
          setShowCreateSheet(false)
          setForm(DEFAULT_FORM)
          toast.success(t('toast.created', { name: form.name }))
          Either.match(result, {
            onLeft: () => {},
            onRight: (room) => {
              updatePlantRoomAssignments(room.id, new Set())
            },
          })
        },
        onError: () => toast.error(t('toast.createFailed')),
      }
    )
  }, [form, createRoom, t, updatePlantRoomAssignments])

  const handleUpdate = useCallback(() => {
    if (!editingRoomId || String.isEmpty(String.trim(form.name))) return
    updateRoom.mutate(
      {
        path: { id: editingRoomId },
        payload: {
          name: form.name,
          icon: form.icon,
          luminosity: form.luminosity,
        },
      },
      {
        onSuccess: () => {
          setShowEditSheet(false)
          const roomId = editingRoomId
          const initialIds = initialPlantIdsRef.current
          setEditingRoomId(null)
          setForm(DEFAULT_FORM)
          toast.success(t('toast.updated', { name: form.name }))
          updatePlantRoomAssignments(roomId, initialIds)
        },
        onError: () => toast.error(t('toast.updateFailed')),
      }
    )
  }, [editingRoomId, form, updateRoom, t, updatePlantRoomAssignments])

  const handleDelete = useCallback(() => {
    if (!deletingRoom) return
    deleteRoom.mutate(
      { path: { id: deletingRoom.id } },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          toast.success(t('toast.deleted', { name: deletingRoom.name }))
          setDeletingRoom(null)
        },
        onError: () => {
          setShowDeleteConfirm(false)
          toast.error(t('toast.deleteFailed'))
          setDeletingRoom(null)
        },
      }
    )
  }, [deletingRoom, deleteRoom, t])

  const isInitialLoading = isLoading && !rooms
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const roomsList = Option.getOrElse(
    Option.fromNullable(rooms),
    () => [] as NonNullable<typeof rooms>
  )

  return (
    <View
      className="flex-1 bg-background dark:bg-background-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={iconColors.textPrimary}
          />
        </Pressable>
        <Text className="text-lg font-bold text-text-primary dark:text-white">
          {t('title')}
        </Text>
        <Pressable
          onPress={handleOpenCreate}
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <MaterialIcons name="add" size={24} color={iconColors.primary} />
        </Pressable>
      </View>

      {/* Content */}
      {showSkeleton ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <RoomsContentSkeleton />
        </Animated.View>
      ) : isInitialLoading ? null : Array.isEmptyReadonlyArray(roomsList) ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <EmptyState
            title={t('empty.title')}
            description={t('empty.description')}
            action={{
              label: t('empty.button'),
              onPress: handleOpenCreate,
            }}
          />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1">
          <FlatList
            data={roomsList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleOpenEdit(item)}
                className="flex-row items-center p-4 mb-2 bg-surface dark:bg-surface-dark rounded-xl"
              >
                <Text className="text-2xl mr-3">{item.icon}</Text>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-text-primary dark:text-white">
                    {item.name}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    <Text className="text-sm text-text-muted dark:text-slate-400">
                      {t('plantCount', { count: item.plantCount })}
                    </Text>
                    {item.luminosity != null && (
                      <Text className="text-xs text-text-muted dark:text-slate-400">
                        {
                          LUMINOSITY_LEVELS[item.luminosity as LuminosityLevel]
                            .icon
                        }{' '}
                        {
                          LUMINOSITY_LEVELS[item.luminosity as LuminosityLevel]
                            .label
                        }
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={() => handleOpenDelete(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="w-8 h-8 items-center justify-center"
                >
                  <MaterialIcons
                    name="delete-outline"
                    size={20}
                    color={iconColors.textMuted}
                  />
                </Pressable>
              </Pressable>
            )}
          />
        </Animated.View>
      )}

      {/* Create Room Sheet */}
      <BottomSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        title={t('create.title')}
        snapPoints={['75%']}
      >
        <RoomForm
          form={form}
          onFormChange={setForm}
          onSubmit={handleCreate}
          submitLabel={t('create.button')}
          isLoading={createRoom.isPending}
          plants={availablePlantsForCreate}
          selectedPlantIds={selectedPlantIds}
          onTogglePlant={handleTogglePlant}
        />
      </BottomSheet>

      {/* Edit Room Sheet */}
      <BottomSheet
        visible={showEditSheet}
        onClose={() => {
          setShowEditSheet(false)
          setEditingRoomId(null)
        }}
        title={t('edit.title')}
        snapPoints={['75%']}
      >
        <RoomForm
          form={form}
          onFormChange={setForm}
          onSubmit={handleUpdate}
          submitLabel={t('edit.button')}
          isLoading={updateRoom.isPending}
          plants={availablePlantsForEdit}
          selectedPlantIds={selectedPlantIds}
          onTogglePlant={handleTogglePlant}
        />
      </BottomSheet>

      {/* Delete Confirmation */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t('delete.title', { name: deletingRoom?.name })}
        message={t('delete.message')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={t('delete.cancel')}
        destructive
        icon={
          <MaterialIcons name="delete" size={28} color={iconColors.coral} />
        }
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeletingRoom(null)
        }}
      />
    </View>
  )
}

interface RoomFormProps {
  form: RoomFormState
  onFormChange: (form: RoomFormState) => void
  onSubmit: () => void
  submitLabel: string
  isLoading: boolean
  plants: readonly Plant[]
  selectedPlantIds: Set<string>
  onTogglePlant: (id: string) => void
}

function RoomForm({
  form,
  onFormChange,
  onSubmit,
  submitLabel,
  isLoading,
  plants,
  selectedPlantIds,
  onTogglePlant,
}: RoomFormProps) {
  const { t } = useTranslation('rooms')
  const iconColors = useIconColors()
  const canSubmit = pipe(form.name, String.trim, String.isNonEmpty)
  const selectedCount = selectedPlantIds.size

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-5 pb-4">
        <View className="gap-2">
          <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
            {t('icon')}
          </Text>
          <EmojiPicker
            value={form.icon}
            onSelect={(icon) => onFormChange({ ...form, icon })}
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-text-primary dark:text-white pl-1">
            {t('roomName')}
          </Text>
          <Input
            value={form.name}
            onChangeText={(name) => onFormChange({ ...form, name })}
            placeholder={t('roomNamePlaceholder')}
            autoFocus
          />
        </View>

        <LuminosityPicker
          value={form.luminosity}
          onChange={(luminosity) => onFormChange({ ...form, luminosity })}
        />

        <View className="gap-2">
          <View className="flex-row items-center justify-between pl-1 pr-1">
            <Text className="text-sm font-semibold text-text-primary dark:text-white">
              {t('plants')}
            </Text>
            {selectedCount > 0 && (
              <Text className="text-xs text-text-muted dark:text-slate-400">
                {t('plantsSelected', { count: selectedCount })}
              </Text>
            )}
          </View>
          <PlantSelector
            plants={plants}
            selectedIds={selectedPlantIds}
            onToggle={onTogglePlant}
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit || isLoading}
          className={`h-14 rounded-xl items-center justify-center ${
            canSubmit ? 'bg-primary' : 'bg-primary/50'
          }`}
        >
          {isLoading ? (
            <ActivityIndicator color={iconColors.white} />
          ) : (
            <Text className="text-base font-semibold text-white">
              {submitLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}
