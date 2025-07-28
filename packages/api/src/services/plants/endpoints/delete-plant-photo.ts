import { Effect } from 'effect'

export const deletePlantPhoto = (_request: {
  plantId: string
  photoId: string
}) => Effect.succeed({ message: 'Photo deleted successfully' })
