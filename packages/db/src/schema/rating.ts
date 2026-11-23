import type { Rating } from '@lily/shared'
import { integer } from 'drizzle-orm/pg-core'

export const rating = (name: string) => integer(name).$type<Rating>().notNull()
