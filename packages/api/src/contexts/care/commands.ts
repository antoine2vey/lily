import type { CarePlant } from '@lily/api/contexts/care/domain/care-plant'
import type {
  AccountsHeld,
  Decision,
  Refusal,
} from '@lily/api/contexts/care/domain/decide'
import { CareTopic } from '@lily/api/contexts/care/domain/events'
import { asError } from '@lily/api/contexts/care/refusals'
import { CareStore } from '@lily/api/contexts/care/store'
import type { PlantRowLock } from '@lily/api/contexts/care/store/lock'
import { Outbox } from '@lily/api/kernel/outbox'
import { servicesOf } from '@lily/api/kernel/services'
import { commandsOf, noNotices } from '@lily/api/kernel/transact'
import type { CareType } from '@lily/shared'
import { Effect, Option, Predicate, type Result } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

/**
 * What the plant row is held with: a row lock alone, or the default lock and
 * the account rows of the users the command's rows name.
 */
export type PlantHold =
  | PlantRowLock
  | { readonly actorIds: ReadonlyArray<string> }

const NO_ACCOUNT_HELD: AccountsHeld = new Set()

/** How the three Care services run a command, over the one `CareStore`. */
export const careCommands = Effect.gen(function* () {
  const store = yield* CareStore
  const context = yield* servicesOf(Outbox, SqlClient.SqlClient)
  const { run } = commandsOf(
    { topic: CareTopic, apply: store.apply, notices: noNotices, asError },
    context
  )

  /**
   * One command on one plant. `decide` gets the plant, none when it is gone,
   * and the accounts the load held.
   */
  const onPlant = <A, F extends Refusal>(
    name: string,
    plantId: string,
    careTypes: ReadonlyArray<CareType>,
    decide: (
      plant: Option.Option<CarePlant>,
      accountsHeld: AccountsHeld
    ) => Result.Result<Decision<A>, F>,
    hold: PlantHold = 'no key update'
  ) =>
    run(
      name,
      Predicate.isString(hold)
        ? Effect.map(
            store.lockAndLoad([plantId], careTypes, hold),
            (plants) => ({ plants, accountsHeld: NO_ACCOUNT_HELD })
          )
        : store.lockAndLoadFor(hold.actorIds, [plantId], careTypes),
      ({ plants, accountsHeld }) =>
        decide(Option.fromNullishOr(plants.get(plantId)), accountsHeld)
    )

  return { run, onPlant }
})
