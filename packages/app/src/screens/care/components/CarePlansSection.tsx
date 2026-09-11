import { MaterialIcons } from '@expo/vector-icons'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { Array, Option, pipe } from 'effect'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { SectionHeader } from '@/components/SectionHeader'
import {
  useDeleteCarePlan,
  useDeleteCarePlanStep,
} from '@/hooks/useCarePlanMutations'
import { useCarePlanStepActions } from '@/hooks/useCarePlanStepActions'
import { useCarePlans } from '@/hooks/useCarePlans'
import { useIconColors } from '@/hooks/useIconColors'
import { CarePlanChecklistCard } from '@/screens/care/components/CarePlanChecklistCard'

type PendingDeletion =
  | { _tag: 'None' }
  | { _tag: 'Plan'; plan: CarePlan }
  | { _tag: 'Step'; plan: CarePlan; step: CarePlanStep }

/** Accepted AI care plans, one checklist card per plan. */
export function CarePlansSection() {
  const { t } = useTranslation('care')
  const iconColors = useIconColors()
  const { data } = useCarePlans()
  const { pendingStepIds, toggleStep, undoStep } = useCarePlanStepActions()
  const deletePlan = useDeleteCarePlan()
  const deleteStep = useDeleteCarePlanStep()
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>({
    _tag: 'None',
  })

  const plans = pipe(
    Option.fromNullable(data?.items),
    Option.getOrElse(() => [] as ReadonlyArray<CarePlan>)
  )

  if (!Array.isNonEmptyReadonlyArray(plans)) return null

  const closeModal = () => setPendingDeletion({ _tag: 'None' })

  const confirmDeletion = () => {
    if (pendingDeletion._tag === 'Plan') {
      deletePlan.mutate({ path: { planId: pendingDeletion.plan.id } })
    }
    if (pendingDeletion._tag === 'Step') {
      deleteStep.mutate({
        path: {
          planId: pendingDeletion.plan.id,
          stepId: pendingDeletion.step.id,
        },
      })
    }
    closeModal()
  }

  const modalKey = pendingDeletion._tag === 'Step' ? 'deleteStep' : 'deletePlan'

  return (
    <View testID="care-plans-section">
      <SectionHeader title={t('plans.section')} />
      <View className="mt-3">
        {Array.map(plans, (plan) => (
          <CarePlanChecklistCard
            key={plan.id}
            plan={plan}
            showPlant
            pendingStepIds={pendingStepIds}
            onStepPress={(step) => toggleStep(plan, step)}
            onStepUndo={undoStep}
            onStepLongPress={(step) =>
              setPendingDeletion({ _tag: 'Step', plan, step })
            }
            onDeletePlan={() => setPendingDeletion({ _tag: 'Plan', plan })}
            onPlantPress={() => router.push(`/plant/${plan.plantId}`)}
          />
        ))}
      </View>

      <ConfirmationModal
        visible={pendingDeletion._tag !== 'None'}
        title={t(`plans.${modalKey}.title`)}
        message={t(`plans.${modalKey}.message`)}
        confirmLabel={t(`plans.${modalKey}.confirm`)}
        cancelLabel={t(`plans.${modalKey}.cancel`)}
        onConfirm={confirmDeletion}
        onCancel={closeModal}
        icon={
          <MaterialIcons
            name="delete-outline"
            size={28}
            color={iconColors.coral}
          />
        }
      />
    </View>
  )
}
