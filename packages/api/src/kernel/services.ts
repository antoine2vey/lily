import { Context, Effect } from 'effect'

/**
 * The services `keys` name, read from the running fiber with nothing else of
 * its context. `Effect.context` returns the whole context: inside a
 * transaction it holds that transaction's connection, and in a layer it holds
 * the layer's scope, and an effect later provided with it reuses them.
 */
export const servicesOf = <
  const Keys extends ReadonlyArray<Context.Key<unknown, unknown>>,
>(
  ...keys: Keys
): Effect.Effect<
  Context.Context<Context.Service.Identifier<Keys[number]>>,
  never,
  Context.Service.Identifier<Keys[number]>
> =>
  Effect.map(
    Effect.context<Context.Service.Identifier<Keys[number]>>(),
    Context.pick(...keys)
  )
