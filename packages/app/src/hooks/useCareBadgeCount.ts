import { Array, Option } from 'effect'
import { useCareTasks } from '@/hooks/useCareTasks'

export function useCareBadgeCount(): number {
  const { data } = useCareTasks()
  const overdue = Array.length(
    Option.getOrElse(Option.fromNullable(data?.overdue), () => [])
  )
  const today = Array.length(
    Option.getOrElse(Option.fromNullable(data?.today), () => [])
  )
  return overdue + today
}
