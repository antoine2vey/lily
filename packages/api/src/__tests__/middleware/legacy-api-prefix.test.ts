import { toVersionedUrl } from '@lily/api/middleware/legacy-api-prefix'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

describe('toVersionedUrl', () => {
  it.each([
    ['/api', '/api/v1'],
    ['/api/', '/api/v1/'],
    ['/api/plants', '/api/v1/plants'],
    ['/api/plants/abc/photos', '/api/v1/plants/abc/photos'],
    ['/api?page=2', '/api/v1?page=2'],
    ['/api/plants?page=2&limit=20', '/api/v1/plants?page=2&limit=20'],
    ['/api/search?q=/api/v1', '/api/v1/search?q=/api/v1'],
    ['/api/v10/x', '/api/v1/v10/x'],
    ['/api/v1beta', '/api/v1/v1beta'],
  ])('rewrites %s to %s', (url, expected) => {
    expect(toVersionedUrl(url)).toEqual(Option.some(expected))
  })

  it.each([
    '/api/v1',
    '/api/v1/',
    '/api/v1/plants',
    '/api/v1?page=2',
    '/api/v1/plants?page=2',
    '/apiary',
    '/apiary/plants',
    '/apis?x=/api/plants',
    '/health',
    '/health/live',
    '/internal/service-token',
    '/openapi.json',
    '/docs',
    '/',
    '/v1/api/plants',
  ])('leaves %s alone', (url) => {
    expect(toVersionedUrl(url)).toEqual(Option.none())
  })
})
