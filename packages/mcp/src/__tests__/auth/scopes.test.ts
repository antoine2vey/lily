import { grantScopes, SCOPES_SUPPORTED } from '@lily/mcp/auth/scopes'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

describe('grantScopes', () => {
  it.each([null, '', '  '])(
    'grants every scope when none is requested (%j)',
    (requested) => {
      expect(grantScopes(requested)).toEqual(Option.some(SCOPES_SUPPORTED))
    }
  )

  it('grants exactly the requested supported scopes', () => {
    expect(grantScopes('plants:read  knowledge:read plants:read')).toEqual(
      Option.some(['plants:read', 'knowledge:read'])
    )
  })

  it('rejects a request naming an unsupported scope', () => {
    expect(grantScopes('plants:read admin')).toEqual(Option.none())
  })
})
