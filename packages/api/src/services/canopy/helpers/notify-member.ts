import { Option } from 'effect'

export const senderNameOf = (
  name: string | null | undefined
): { readonly senderName?: string } =>
  Option.match(Option.fromNullishOr(name), {
    onNone: () => ({}),
    onSome: (senderName) => ({ senderName }),
  })
