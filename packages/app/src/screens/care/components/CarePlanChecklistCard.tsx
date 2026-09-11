import { MaterialIcons } from '@expo/vector-icons'
import { daysUntil, formatShortDate, parseApiDate } from '@lily/shared'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { Array, Match, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { Badge } from '@/components/Badge'
import { useIconColors } from '@/hooks/useIconColors'
import { getCareTypeConfig } from '@/screens/care/components/care-type-config'
import { UndoButton } from '@/screens/care/components/UndoButton'

interface CarePlanChecklistCardProps {
  plan: CarePlan
  /** Show the plant avatar + name in the header (Care tab). */
  showPlant?: boolean
  pendingStepIds: ReadonlySet<string>
  onStepPress: (step: CarePlanStep) => void
  onStepUndo: (stepId: string) => void
  onStepLongPress?: (step: CarePlanStep) => void
  onDeletePlan?: () => void
  onPlantPress?: () => void
}

type DueState = 'none' | 'overdue' | 'today' | 'future'

const dueStateOf = (step: CarePlanStep): DueState =>
  pipe(
    Option.fromNullable(step.dueDate),
    Option.flatMap(parseApiDate),
    Option.map(daysUntil),
    Option.match({
      onNone: (): DueState => 'none',
      onSome: (days): DueState =>
        pipe(
          Match.value(days),
          Match.when(
            (d) => d < 0,
            (): DueState => 'overdue'
          ),
          Match.when(0, (): DueState => 'today'),
          Match.orElse((): DueState => 'future')
        ),
    })
  )

export function CarePlanChecklistCard({
  plan,
  showPlant = false,
  pendingStepIds,
  onStepPress,
  onStepUndo,
  onStepLongPress,
  onDeletePlan,
  onPlantPress,
}: CarePlanChecklistCardProps) {
  const { t, i18n } = useTranslation('care')
  const iconColors = useIconColors()

  const doneCount = Array.length(
    Array.filter(plan.steps, (s) =>
      Option.isSome(Option.fromNullable(s.completedAt))
    )
  )
  const totalCount = Array.length(plan.steps)

  const renderDueLabel = (step: CarePlanStep) => {
    const state = dueStateOf(step)
    const isDone = Option.isSome(Option.fromNullable(step.completedAt))
    if (state === 'none' || isDone) return null
    const label = pipe(
      Match.value(state),
      Match.when('overdue', () => t('plans.overdue')),
      Match.when('today', () => t('plans.dueToday')),
      Match.when('future', () =>
        t('plans.due', {
          date: pipe(
            Option.fromNullable(step.dueDate),
            Option.flatMap(parseApiDate),
            Option.map((d) => formatShortDate(d, i18n.language)),
            Option.getOrElse(() => '')
          ),
        })
      ),
      Match.exhaustive
    )
    return (
      <Text
        className={`text-xs ml-2 ${state === 'overdue' ? 'text-coral' : 'text-text-muted dark:text-slate-400'}`}
      >
        {label}
      </Text>
    )
  }

  return (
    <View
      testID={`care-plan-${plan.id}`}
      className="rounded-2xl p-4 mb-3 bg-surface dark:bg-surface-dark"
    >
      {/* Header */}
      <View className="flex-row items-center mb-3">
        {showPlant && (
          <Pressable
            onPress={onPlantPress}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          >
            <AnimatedImage
              source={{
                uri: pipe(
                  Option.fromNullable(plan.plantImageUrl),
                  Option.getOrUndefined
                ),
              }}
              className="w-10 h-10 bg-border"
              rounded
            />
          </Pressable>
        )}
        <View className={`flex-1 ${showPlant ? 'ml-3' : ''}`}>
          {showPlant && (
            <Text
              className="text-xs uppercase font-medium text-text-muted dark:text-slate-400"
              numberOfLines={1}
            >
              {plan.plantName}
            </Text>
          )}
          <Text
            className="text-base font-semibold text-text-primary dark:text-white"
            numberOfLines={2}
          >
            {plan.title}
          </Text>
          <Text className="text-xs mt-0.5 text-text-muted dark:text-slate-400">
            {t('plans.progress', { done: doneCount, total: totalCount })}
            {' · '}
            {t('plans.fromLily')}
          </Text>
        </View>
        {onDeletePlan && (
          <Pressable
            testID={`care-plan-${plan.id}-delete`}
            onPress={onDeletePlan}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="ml-2"
          >
            <MaterialIcons
              name="delete-outline"
              size={20}
              color={iconColors.muted}
            />
          </Pressable>
        )}
      </View>

      {/* Steps */}
      <View className="gap-1">
        {Array.map(plan.steps, (step) => {
          const isDone = Option.isSome(Option.fromNullable(step.completedAt))
          const isPending = pendingStepIds.has(step.id)
          const careConfig = pipe(
            Option.fromNullable(step.careType),
            Option.map((type) => getCareTypeConfig(type, iconColors)),
            Option.getOrUndefined
          )
          return (
            <Pressable
              key={step.id}
              testID={`care-plan-step-${step.id}`}
              onPress={isPending ? undefined : () => onStepPress(step)}
              onLongPress={
                onStepLongPress ? () => onStepLongPress(step) : undefined
              }
              disabled={isPending}
              className={`flex-row items-center py-2 px-2 rounded-xl ${isPending ? 'border border-primary' : 'active:bg-surface-tinted dark:active:bg-slate-700'}`}
            >
              <View className="w-8 h-8 items-center justify-center">
                <MaterialIcons
                  name={
                    isDone || isPending
                      ? 'check-circle'
                      : 'radio-button-unchecked'
                  }
                  size={24}
                  color={
                    isDone || isPending ? iconColors.primary : iconColors.border
                  }
                />
              </View>
              <View className="flex-1 ml-2">
                <Text
                  className={`text-sm font-medium ${isDone ? 'line-through text-text-muted dark:text-slate-500' : 'text-text-primary dark:text-white'}`}
                >
                  {step.title}
                </Text>
                {step.description && !isDone && (
                  <Text className="text-xs mt-0.5 text-text-muted dark:text-slate-400">
                    {step.description}
                  </Text>
                )}
                {(careConfig || dueStateOf(step) !== 'none') && (
                  <View className="flex-row items-center mt-1">
                    {careConfig && (
                      <Badge
                        label={t(`types.${careConfig.labelKey}.badge`)}
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
                    {renderDueLabel(step)}
                  </View>
                )}
              </View>
              {isPending && <UndoButton onUndo={() => onStepUndo(step.id)} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
