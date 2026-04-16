import { createFileFromUri } from '@/utils/upload'

// Note: uploadMultipart is difficult to test without extensive mocking of
// fetch, SecureStore, and the refreshAccessToken flow. The function relies on:
// - SecureStore.getItemAsync for token retrieval
// - fetch for actual HTTP requests
// - Token refresh logic
//
// We focus on testing the pure utility functions that can be unit tested.

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
