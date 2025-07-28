import { client } from '@lily/db/client'
import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library'
import { Data, Effect } from 'effect'

export class PrismaError extends Data.TaggedError('PrismaError')<{
  details:
    | PrismaClientKnownRequestError
    | PrismaClientUnknownRequestError
    | PrismaClientRustPanicError
    | PrismaClientInitializationError
    | PrismaClientValidationError
}> {}

type FilterNotContaining<
  Set,
  Needle extends string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
> = Set extends `${infer _A}${Needle}${infer _B}` ? never : Set

type ExcludeFromUnionOtherTypes<From, E> = From extends E ? From : never

type ExcludeNonStringKeys<Obj> = {
  [k in ExcludeFromUnionOtherTypes<keyof Obj, string>]: k extends string
    ? Obj[k]
    : never
}

type ExcludeKeysContaining<
  Obj extends Record<string, any>,
  Key extends string,
> = {
  [key in FilterNotContaining<keyof Obj, Key>]: Obj[key]
}

export type Client = ExcludeKeysContaining<
  ExcludeNonStringKeys<PrismaClient>,
  '$' | '_'
> & {}

type LazyPromiseToLazyEffect<Fn extends (...a: any[]) => any> = Fn extends (
  ...a: infer Args
) => Promise<infer Result>
  ? (...a: Args) => Effect.Effect<Result, PrismaError, never>
  : never

type EffectifyObject<
  Obj extends Record<string, F>,
  F extends (...a: any[]) => any = any,
> = {
  [op in keyof Obj]: LazyPromiseToLazyEffect<Obj[op]>
}

type EffectPrisma = {
  [model in keyof Client]: EffectifyObject<Client[model]>
}

export class PrismaService extends Effect.Service<PrismaService>()('Prisma', {
  effect: Effect.sync(() => {
    return new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          return {
            enumerable: true,
            configurable: true,
          }
        },
        ownKeys() {
          return Object.values(Prisma.ModelName).map((name) =>
            name.toLowerCase()
          )
        },
        get(_target, model) {
          // Convert accessed property to lowercase to match Prisma client
          const modelName =
            typeof model === 'string' ? model.toLowerCase() : model

          return new Proxy(
            {},
            {
              get(_target, method) {
                return (...args: unknown[]) => {
                  return Effect.tryPromise(() => {
                    return (client as any)[modelName][method](...args)
                  })
                }
              },
            }
          )
        },
      }
    ) as EffectPrisma
  }),
}) {}
