import type { PrismaError, PrismaService } from '@lily/db'
import { Effect } from 'effect'

export const deletePlantPhoto = (_request: {
  plantId: string
  photoId: string
}): Effect.Effect<{ message: string }, PrismaError, PrismaService> =>
  Effect.succeed({ message: 'Photo deleted successfully' })
