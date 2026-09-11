import { MaterialIcons } from '@expo/vector-icons'
import type { CareType } from '@lily/shared'
import type { CarePlan, CarePlanStatus } from '@lily/shared/care-plan'
import { Array, Match, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Badge } from '@/components/Badge'
import {
  useAcceptCarePlan,
  useDismissCarePlan,
} from '@/hooks/useCarePlanMutations'
import { usePlantCarePlans } from '@/hooks/useCarePlans'
import { useIconColors } from '@/hooks/useIconColors'
import { getCareTypeConfig } from '@/screens/care/components/care-type-config'

/** Step shape as it comes out of the tool call input. */
export interface ProposedStep {
  title: string
  description?: string | undefined
  careType?: CareType | undefined
  dueInDays?: number | undefined
}

interface CarePlanCardProps {
  carePlanId: string
  title: string
  steps: ReadonlyArray<ProposedStep>
  plantId?: string | undefined
  /**
   * `card`: standalone bubble with its own header (proposeCarePlan tool).
   * `section`: steps + actions only, embedded inside the diagnosis card's
   * Treatment block so the same steps are not listed twice.
   */
  presentation?: 'card' | 'section'
}

interface StepView {
  key: string
  title: string
  description?: string | undefined
  careType?: CareType | undefined
  dueInDays?: number | undefined
  completed: boolean
}

const stepsFromProposal = (steps: ReadonlyArray<ProposedStep>): StepView[] =>
  Array.map(steps, (s, i) => ({
    key: `proposed-${i}`,
    title: s.title,
    description: s.description,
    careType: s.careType,
    dueInDays: s.dueInDays,
    completed: false,
  }))

const stepsFromPlan = (
  plan: CarePlan,
  proposal: ReadonlyArray<ProposedStep>
): StepView[] =>
  Array.map(plan.steps, (s, i) => ({
    key: s.id,
    title: s.title,
    description: s.description,
    careType: s.careType,
    // Relative offsets only exist on the proposal; keep them for display.
    dueInDays: pipe(
      Array.get(proposal, i),
      Option.flatMap((p) => Option.fromNullable(p.dueInDays)),
      Option.getOrUndefined
    ),
    completed: Option.isSome(Option.fromNullable(s.completedAt)),
  }))

export function CarePlanCard({
  carePlanId,
  title,
  steps,
  plantId,
  presentation = 'card',
}: CarePlanCardProps) {
  const { t } = useTranslation(['chat', 'care'])
  const iconColors = useIconColors()
  const { data: plansData } = usePlantCarePlans(plantId)
  const acceptMutation = useAcceptCarePlan()
  const dismissMutation = useDismissCarePlan()

  const storedPlan = pipe(
    Option.fromNullable(plansData?.items),
    Option.flatMap((items) =>
      Array.findFirst(items, (p) => p.id === carePlanId)
    )
  )

  // Server state wins; before the plans query resolves (or for a plan that
  // was deleted) fall back to the proposal as it was streamed.
  const status: CarePlanStatus = pipe(
    storedPlan,
    Option.map((p) => p.status),
    Option.getOrElse((): CarePlanStatus => 'proposed')
  )
  const stepViews = pipe(
    storedPlan,
    Option.map((p) => stepsFromPlan(p, steps)),
    Option.getOrElse(() => stepsFromProposal(steps))
  )

  const isBusy = acceptMutation.isPending || dismissMutation.isPending

  const dueLabel = (dueInDays: number | undefined) =>
    pipe(
      Option.fromNullable(dueInDays),
      Option.map((days) =>
        days === 0
          ? t('chat:carePlan.dueToday')
          : t('chat:carePlan.dueInDays', { count: days })
      ),
      Option.getOrUndefined
    )

  const footer = pipe(
    Match.value(status),
    Match.when('proposed', () => (
      <View className="flex-row items-center mt-1 gap-2">
        <Pressable
          testID={`care-plan-card-${carePlanId}-accept`}
          onPress={() =>
            acceptMutation.mutate({ path: { planId: carePlanId } })
          }
          disabled={isBusy}
          className="flex-1 flex-row items-center justify-center py-2.5 rounded-md bg-primary"
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator size="small" color={iconColors.white} />
          ) : (
            <>
              <MaterialIcons
                name="playlist-add-check"
                size={18}
                color={iconColors.white}
              />
              <Text
                className="text-sm font-semibold text-white ml-1.5"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('chat:carePlan.addToTasks')}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          testID={`care-plan-card-${carePlanId}-dismiss`}
          onPress={() =>
            dismissMutation.mutate({ path: { planId: carePlanId } })
          }
          disabled={isBusy}
          className="px-3 py-2.5 rounded-md bg-surface-tinted dark:bg-slate-700"
        >
          <Text className="text-sm font-medium text-text-muted dark:text-slate-300">
            {t('chat:carePlan.dismiss')}
          </Text>
        </Pressable>
      </View>
    )),
    Match.when('accepted', () => (
      <View className="flex-row items-center justify-center py-2.5 rounded-md bg-success/10 mt-1">
        <MaterialIcons
          name="check-circle"
          size={18}
          color={iconColors.primary}
        />
        <Text
          className="text-sm font-semibold text-success ml-1.5"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {t('chat:carePlan.added')}
        </Text>
      </View>
    )),
    Match.when('completed', () => (
      <View className="flex-row items-center justify-center py-2.5 rounded-md bg-success/10 mt-1">
        <MaterialIcons name="task-alt" size={18} color={iconColors.primary} />
        <Text
          className="text-sm font-semibold text-success ml-1.5"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {t('chat:carePlan.completed')}
        </Text>
      </View>
    )),
    Match.when('dismissed', () => (
      <View className="flex-row items-center justify-center py-2.5 rounded-md bg-surface-tinted dark:bg-slate-700 mt-1">
        <Text className="text-sm font-medium text-text-muted dark:text-slate-300">
          {t('chat:carePlan.dismissed')}
        </Text>
      </View>
    )),
    Match.exhaustive
  )

  const stepsList = (
    <View className="mb-3 gap-1.5">
      {Array.map(stepViews, (step, idx) => {
        const careConfig = pipe(
          Option.fromNullable(step.careType),
          Option.map((type) => getCareTypeConfig(type, iconColors)),
          Option.getOrUndefined
        )
        const due = dueLabel(step.dueInDays)
        return (
          <View key={step.key} className="flex-row items-start">
            {step.completed ? (
              <MaterialIcons
                name="check-circle"
                size={18}
                color={iconColors.primary}
                style={{ marginRight: 6, marginTop: 1, width: 20 }}
              />
            ) : (
              <Text
                className="text-primary dark:text-primary-light mr-2 text-sm font-semibold"
                style={{
                  fontFamily: 'SpaceGrotesk_600SemiBold',
                  minWidth: 20,
                }}
              >
                {idx + 1}.
              </Text>
            )}
            <View className="flex-1">
              <Text
                className={`text-sm flex-1 font-regular ${step.completed ? 'line-through text-text-muted dark:text-slate-500' : 'text-text-primary dark:text-white'}`}
              >
                {step.title}
              </Text>
              {step.description && (
                <Text className="text-xs mt-0.5 text-text-muted dark:text-slate-400">
                  {step.description}
                </Text>
              )}
              {(careConfig || due) && (
                <View className="flex-row items-center mt-1">
                  {careConfig && (
                    <Badge
                      label={t(`care:types.${careConfig.labelKey}.badge`)}
                      variant="info"
                      size="sm"
                      icon={
                        <MaterialIcons
                          name={careConfig.icon}
                          size={10}
                          color={careConfig.color}
                        />
                      }
                    />
                  )}
                  {due && (
                    <Text className="text-xs ml-2 text-text-muted dark:text-slate-400">
                      {due}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )

  if (presentation === 'section') {
    return (
      <View testID={`care-plan-card-${carePlanId}`}>
        {stepsList}
        {footer}
      </View>
    )
  }

  return (
    <View
      testID={`care-plan-card-${carePlanId}`}
      className="bg-surface dark:bg-surface-dark rounded-lg p-4 border border-border dark:border-slate-700 my-2"
    >
      {/* Header */}
      <View className="flex-row items-center mb-3">
        <MaterialIcons
          name="checklist"
          size={18}
          color={iconColors.primary}
          style={{ marginRight: 6 }}
        />
        <View className="flex-1">
          <Text
            className="text-xs text-text-muted dark:text-slate-400 uppercase tracking-wide"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {t('chat:carePlan.title')}
            {' · '}
            {t('chat:carePlan.stepsCount', { count: Array.length(stepViews) })}
          </Text>
          <Text
            className="text-base font-semibold text-text-primary dark:text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            {title}
          </Text>
        </View>
      </View>

      {stepsList}
      {footer}
    </View>
  )
}
