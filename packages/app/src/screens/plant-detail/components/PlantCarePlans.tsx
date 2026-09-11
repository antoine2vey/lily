import type { CarePlan } from '@lily/shared/care-plan'
import { Array, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { SectionHeader } from '@/components/SectionHeader'
import { useCarePlanStepActions } from '@/hooks/useCarePlanStepActions'
import { usePlantCarePlans } from '@/hooks/useCarePlans'
import { CarePlanChecklistCard } from '@/screens/care/components/CarePlanChecklistCard'

interface PlantCarePlansProps {
  plantId: string
}

/** Accepted plans for this plant, same checklist card as the Care tab. */
export function PlantCarePlans({ plantId }: PlantCarePlansProps) {
  const { t } = useTranslation('care')
  const { data } = usePlantCarePlans(plantId)
  const { pendingStepIds, toggleStep, undoStep } = useCarePlanStepActions()

  const plans = pipe(
    Option.fromNullable(data?.items),
    Option.getOrElse(() => [] as ReadonlyArray<CarePlan>),
    Array.filter((p) => p.status === 'accepted')
  )

  if (!Array.isNonEmptyReadonlyArray(plans)) return null

  return (
    <View>
      <SectionHeader title={t('plans.section')} />
      <View className="mt-3">
        {Array.map(plans, (plan) => (
          <CarePlanChecklistCard
            key={plan.id}
            plan={plan}
            pendingStepIds={pendingStepIds}
            onStepPress={(step) => toggleStep(plan, step)}
            onStepUndo={undoStep}
          />
        ))}
      </View>
    </View>
  )
}
