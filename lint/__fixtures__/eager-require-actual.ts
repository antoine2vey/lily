// Fixture for lint/eager-require-actual.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
declare const jest: {
  mock: (name: string, factory: () => unknown) => void
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

export const outsideAMock = () => () => jest.requireActual('effect')
