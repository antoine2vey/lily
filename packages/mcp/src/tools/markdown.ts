import {
  ownershipLabel,
  type PlantOwnershipFields,
} from '@lily/mcp/widgets/mappers'
import { Option, pipe, String } from 'effect'

export const escapeInlineMarkdown = (text: string): string =>
  pipe(
    text,
    String.replaceAll(/[\r\n]+/g, ' '),
    String.replaceAll(/[\\`*_[\]()#<>|~]/g, '\\$&')
  )

export const ownershipSuffix = (plant: PlantOwnershipFields): string =>
  pipe(
    ownershipLabel(plant),
    Option.map((label) => ` | ${escapeInlineMarkdown(label)}`),
    Option.getOrElse(() => '')
  )
