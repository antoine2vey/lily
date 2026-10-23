import { createFileFromUri, uploadMultipart } from '@/utils/upload'

describe('uploadMultipart', () => {
  const originalFetch = global.fetch
  const originalFormData = global.FormData

  // Jest's Node FormData stringifies object parts; React Native's keeps them
  // as appended, which is what expo/fetch later serialises on device.
  class PartsFormData {
    parts: Array<[string, unknown]> = []
    append(name: string, value: unknown) {
      this.parts.push([name, value])
    }
    getAll(name: string) {
      return this.parts.filter(([key]) => key === name).map(([, v]) => v)
    }
  }

  beforeEach(() => {
    global.FormData = PartsFormData as unknown as typeof FormData
  })

  afterEach(() => {
    global.fetch = originalFetch
    global.FormData = originalFormData
  })

  it('sends file parts expo/fetch can serialise, not { uri } objects', async () => {
    const fileBytes = new Uint8Array([1, 2, 3])
    const requests: Array<{ url: string; body: unknown }> = []
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body })
      return url.startsWith('file://')
        ? ({ arrayBuffer: async () => fileBytes.buffer } as Response)
        : ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ name: 'Ficus' }),
          } as unknown as Response)
    }) as typeof fetch

    await uploadMultipart(
      '/api/plants/detect',
      [createFileFromUri('file:///tmp/a.jpg', { name: 'detect-1.jpg' })],
      'images'
    )

    const body = requests[0]?.body as FormData
    const [part] = body.getAll('images') as unknown as Array<{
      name: string
      type: string
      bytes: () => Promise<Uint8Array>
    }>
    expect(part).not.toHaveProperty('uri')
    expect(part?.name).toBe('detect-1.jpg')
    expect(part?.type).toBe('image/jpeg')
    await expect(part?.bytes()).resolves.toEqual(fileBytes)
  })
})

describe('createFileFromUri', () => {
  it('should create a file object with default name and type', () => {
    const uri = 'file://test-image.jpg'
    const result = createFileFromUri(uri)

    expect(result).toEqual({
      uri: 'file://test-image.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    })
  })

  it('should create a file object with custom name', () => {
    const uri = 'file://test-image.png'
    const result = createFileFromUri(uri, { name: 'my-photo.png' })

    expect(result).toEqual({
      uri: 'file://test-image.png',
      name: 'my-photo.png',
      type: 'image/jpeg',
    })
  })

  it('should create a file object with custom type', () => {
    const uri = 'file://test-image.png'
    const result = createFileFromUri(uri, { type: 'image/png' })

    expect(result).toEqual({
      uri: 'file://test-image.png',
      name: 'photo.jpg',
      type: 'image/png',
    })
  })

  it('should create a file object with custom name and type', () => {
    const uri = 'file://document.pdf'
    const result = createFileFromUri(uri, {
      name: 'document.pdf',
      type: 'application/pdf',
    })

    expect(result).toEqual({
      uri: 'file://document.pdf',
      name: 'document.pdf',
      type: 'application/pdf',
    })
  })

  it('should handle content:// URIs from Android', () => {
    const uri = 'content://media/external/images/media/12345'
    const result = createFileFromUri(uri, {
      name: 'android-image.jpg',
      type: 'image/jpeg',
    })

    expect(result.uri).toBe('content://media/external/images/media/12345')
    expect(result.name).toBe('android-image.jpg')
  })

  it('should handle ph:// URIs from iOS Photos', () => {
    const uri = 'ph://ABC123-DEF456'
    const result = createFileFromUri(uri)

    expect(result.uri).toBe('ph://ABC123-DEF456')
  })

  it('should handle base64 data URIs', () => {
    const uri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
    const result = createFileFromUri(uri, {
      name: 'base64-image.jpg',
      type: 'image/jpeg',
    })

    expect(result.uri).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg...')
  })

  it('should handle empty options object', () => {
    const uri = 'file://test.jpg'
    const result = createFileFromUri(uri, {})

    expect(result).toEqual({
      uri: 'file://test.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
    })
  })
})
