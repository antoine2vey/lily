import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import type { MockNotificationRepositoryOptions } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'

export const createOutboxTimeline = () => {
  const events: string[] = []
  const notificationOptions: MockNotificationRepositoryOptions = {
    onCreate: (n) => {
      events.push(`insert ${n.type} ${n.userId}`)
    },
  }
  return {
    events,
    record: (event: string) => {
      events.push(event)
    },
    sql: createMockSqlClient({
      onTransaction: (event) => {
        events.push(event)
      },
    }),
    queue: createMockMessageQueue({
      onEnqueue: (topic, message) => {
        events.push(`enqueue ${topic} ${message.payload.userId}`)
      },
    }),
    notificationOptions,
  }
}
