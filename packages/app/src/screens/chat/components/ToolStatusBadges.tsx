import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { usePlantCarePlans } from '@/hooks/useCarePlans'
import { useIconColors } from '@/hooks/useIconColors'

type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

const severityClass = (severity: Severity): string =>
  pipe(
    Match.value(severity),
    Match.when('LOW', () => 'bg-success'),
    Match.when('MODERATE', () => 'bg-warning'),
    Match.when('HIGH', () => 'bg-coral'),
    Match.when('CRITICAL', () => 'bg-error'),
    Match.exhaustive
  )

function Pill({
  label,
  className,
  icon,
}: {
  label: string
  className: string
  icon?: keyof typeof MaterialIcons.glyphMap
}) {
  const iconColors = useIconColors()
  return (
    <View
      className={`flex-row items-center px-2.5 py-1 rounded-full ${className}`}
    >
      {icon && (
        <MaterialIcons
          name={icon}
          size={12}
          color={iconColors.white}
          style={{ marginRight: 3 }}
        />
      )}
      <Text
        className="text-xs font-semibold text-white"
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {label}
      </Text>
    </View>
  )
}

interface SeverityBadgeProps {
  severity: Severity
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return <Pill label={severity} className={severityClass(severity)} />
}

interface CarePlanStatusBadgeProps {
  carePlanId: string
  plantId?: string | undefined
}

/**
 * Plan progress pill: hidden while proposed, "n/m" while accepted,
 * "Completed" or "Dismissed" afterwards. Reads the same query the card uses.
 */
export function CarePlanStatusBadge({
  carePlanId,
  plantId,
}: CarePlanStatusBadgeProps) {
  const { t } = useTranslation('chat')
  const { data } = usePlantCarePlans(plantId)
  const plan = pipe(
    Option.fromNullable(data?.items),
    Option.flatMap((items) =>
      Array.findFirst(items, (p) => p.id === carePlanId)
    )
  )
  if (Option.isNone(plan)) return null

  const done = Array.length(
    Array.filter(plan.value.steps, (s) =>
      Option.isSome(Option.fromNullable(s.completedAt))
    )
  )
  const total = Array.length(plan.value.steps)

  return pipe(
    Match.value(plan.value.status),
    Match.when('proposed', () => null),
    Match.when('accepted', () => (
      <Pill
        label={t('summary.progress', { done, total })}
        className="bg-primary"
        icon="checklist"
      />
    )),
    Match.when('completed', () => (
      <Pill
        label={t('carePlan.completed')}
        className="bg-success"
        icon="task-alt"
      />
    )),
    Match.when('dismissed', () => (
      <Pill label={t('carePlan.dismissed')} className="bg-text-muted" />
    )),
    Match.exhaustive
  )
}
