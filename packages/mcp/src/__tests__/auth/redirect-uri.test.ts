import { RedirectUri } from '@lily/mcp/auth/oauth-routes'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'

const accepts = Schema.is(RedirectUri)

describe('RedirectUri', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'http://localhost:6274/oauth/callback',
    'cursor://anysphere.cursor-retrieval/oauth/callback',
  ])('accepts %s', (uri) => {
    expect(accepts(uri)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'not a url',
    '/relative/path',
  ])('rejects %s', (uri) => {
    expect(accepts(uri)).toBe(false)
  })
})
