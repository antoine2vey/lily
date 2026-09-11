import { CARE_TASK_UNDO_TIMEOUT_MS } from '@lily/shared'
import type { CarePlan, CarePlanStep } from '@lily/shared/care-plan'
import { Option } from 'effect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import {
  useCompleteCarePlanStep,
  useUncompleteCarePlanStep,
} from '@/hooks/useCarePlanMutations'
import { useSkipWaitingPreference } from '@/hooks/useSkipWaitingPreference'

/**
 * Step toggling shared by the Care tab and plant detail. Care-typed steps get
 * the same undo countdown as regular tasks (they write a care log); free-text
 * steps flip immediately, and completed steps toggle back to open.
 */
export function useCarePlanStepActions() {
  const { t } = useTranslation('care')
  const { skipWaiting } = useSkipWaitingPreference()
  const completeStep = useCompleteCarePlanStep()
  const uncompleteStep = useUncompleteCarePlanStep()

  const [pendingStepIds, setPendingStepIds] = useState<Set<string>>(new Set())
  const pendingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )

  useEffect(() => {
    const timeouts = pendingTimeouts.current
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout)
      timeouts.clear()
    }
  }, [])

  const clearPending = useCallback((stepId: string) => {
    pendingTimeouts.current.delete(stepId)
    setPendingStepIds((prev) => {
      const next = new Set(prev)
      next.delete(stepId)
      return next
    })
  }, [])

  const fireComplete = useCallback(
    (planId: string, stepId: string) => {
      completeStep.mutate(
        { path: { planId, stepId } },
        { onSuccess: () => toast.success(t('plans.stepCompleted')) }
      )
    },
    [completeStep, t]
  )

  const toggleStep = useCallback(
    (plan: CarePlan, step: CarePlanStep) => {
      if (Option.isSome(Option.fromNullable(step.completedAt))) {
        uncompleteStep.mutate(
          { path: { planId: plan.id, stepId: step.id } },
          { onSuccess: () => toast.success(t('plans.stepReopened')) }
        )
        return
      }

      const isCareAction = Option.isSome(Option.fromNullable(step.careType))
      if (!isCareAction || skipWaiting) {
        fireComplete(plan.id, step.id)
        return
      }

      setPendingStepIds((prev) => new Set(prev).add(step.id))
      const timeoutId = setTimeout(() => {
        fireComplete(plan.id, step.id)
        clearPending(step.id)
      }, CARE_TASK_UNDO_TIMEOUT_MS)
      pendingTimeouts.current.set(step.id, timeoutId)
    },
    [clearPending, fireComplete, skipWaiting, t, uncompleteStep]
  )

  const undoStep = useCallback(
    (stepId: string) => {
      const timeout = pendingTimeouts.current.get(stepId)
      if (timeout) clearTimeout(timeout)
      clearPending(stepId)
    },
    [clearPending]
  )

  return { pendingStepIds, toggleStep, undoStep }
}
