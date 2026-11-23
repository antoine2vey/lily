// Fixture for lint/eager-require-actual.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
declare const jest: {
  mock: (name: string, factory: () => unknown, options?: object) => void
  doMock: (name: string, factory: () => unknown) => void
  isolateModules: (run: () => void) => void
  requireActual: (name: string) => any
  fn: <T>(implementation: T) => T
}
declare const live: { current: boolean }

jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(() => undefined),
  useEffectMutation: jest.fn((...args: unknown[]) =>
    live.current
      ? jest.requireActual('@/utils/client').useEffectMutation(...args) // flag
      : { mutate: () => {} }
  ),
}))

jest.mock('@/hooks/useCarePlant', () => ({
  useCarePlant: () => jest.requireActual('@/hooks/useCarePlant').useCarePlant(), // flag
}))

jest.mock('@/hooks/useDeletePlant', function factory() {
  return {
    useDeletePlant() {
      return jest.requireActual('@/hooks/useDeletePlant').useDeletePlant() // flag
    },
    useOther: function () {
      return jest.requireActual('@/hooks/useDeletePlant').useOther() // flag
    },
  }
})

jest.mock('@/hooks/usePlant', () => ({
  get usePlant() {
    return jest.requireActual('@/hooks/usePlant').usePlant // flag
  },
}))

jest.mock('@/hooks/useRooms', () => {
  function useRooms() {
    return jest.requireActual('@/hooks/useRooms').useRooms() // flag
  }
  return { useRooms }
})

jest.mock('@/services/revenuecat', () => {
  class RevenueCat {
    configure() {
      return jest.requireActual('@/services/revenuecat').configure() // flag
    }
  }
  return { RevenueCat }
})

jest.mock(
  '@/utils/storage',
  () => ({ read: () => jest.requireActual('@/utils/storage').read() }), // flag
  { virtual: true }
)

jest.doMock('@/utils/share', () => ({
  share: () => jest.requireActual('@/utils/share').share(), // flag
}))

jest.mock('@/utils/upload', () => ({
  ...jest.requireActual('@/utils/upload'),
  upload: jest.fn(() => undefined),
}))

jest.mock('@/utils/query-client', () => {
  const actual = jest.requireActual('@/utils/query-client')
  return {
    ...actual,
    createQueryClient: jest.fn(() => actual.createQueryClient()),
  }
})

jest.mock('@/utils/rating-prompt', () => ({
  recordPositiveMoment: jest.requireActual('effect').Effect.void,
}))

jest.mock(
  '@/utils/haptics',
  () => ({ ...jest.requireActual('@/utils/haptics') }),
  { virtual: true }
)

jest.doMock('@/utils/share', () => {
  const actual = jest.requireActual('@/utils/share')
  return { share: () => actual.share() }
})

jest.isolateModules(() => {
  jest.requireActual('@/utils/client')
})

export const outsideAMockGetter = {
  get client() {
    return jest.requireActual('@/utils/client')
  },
}

export function outsideAMockFunction() {
  return jest.requireActual('@/utils/client')
}

export class OutsideAMock {
  load() {
    return jest.requireActual('@/utils/client')
  }
}

export const outsideAMock = () => () => jest.requireActual('effect')
