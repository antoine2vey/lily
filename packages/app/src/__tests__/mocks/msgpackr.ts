// Mock for msgpackr to avoid ESM issues in Jest
export const Packr = jest.fn()
export const Encoder = jest.fn()
export const addExtension = jest.fn()
export const pack = jest.fn()
export const encode = jest.fn()
export const NEVER = 'NEVER'
export const ALWAYS = 'ALWAYS'
export const DECIMAL_ROUND = 'DECIMAL_ROUND'
export const DECIMAL_FIT = 'DECIMAL_FIT'
export const REUSE_BUFFER_MODE = 'REUSE_BUFFER_MODE'
export const RESET_BUFFER_MODE = 'RESET_BUFFER_MODE'
export const RESERVE_START_SPACE = 'RESERVE_START_SPACE'
export const Unpackr = jest.fn()
export const Decoder = jest.fn()
export const unpack = jest.fn()
export const decode = jest.fn()
