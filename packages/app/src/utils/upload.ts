import { Array, Option, pipe, Record, String as Str } from 'effect'
import * as SecureStore from 'expo-secure-store'
import {
  ACCESS_TOKEN_KEY,
  API_BASE_URL,
  type ApiFailure,
  refreshAccessTokenAsync,
} from 'src/utils/client'

/**
 * Error class for upload failures with typed API error support
 */
export class UploadError extends Error {
  readonly apiError?: ApiFailure

  constructor(message: string, apiError?: ApiFailure) {
    super(message)
    this.name = 'UploadError'
    this.apiError = apiError
  }
}

// biome-ignore lint/suspicious/noExplicitAny: FormData requires any for React Native file objects
type FileObject = any

interface UploadFile {
  uri: string
  name: string
  type: string
}

/**
 * Upload files via multipart/form-data to the API
 *
 * @param endpoint - API endpoint path (e.g., '/plants/ai-identify')
 * @param files - Array of files to upload
 * @param fieldName - Form field name for files (default: 'files')
 * @param additionalFields - Additional form fields to include
 */
export async function uploadMultipart<T>(
  endpoint: string,
  files: UploadFile[],
  fieldName = 'files',
  additionalFields?: Record<string, string>
): Promise<T> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)

  const formData = new FormData()

  Array.forEach(files, (file) => {
    const fileObject: FileObject = {
      uri: file.uri,
      type: file.type,
      name: file.name,
    }
    formData.append(fieldName, fileObject)
  })

  if (additionalFields) {
    Array.forEach(Record.toEntries(additionalFields), ([key, value]) => {
      formData.append(key, value)
    })
  }

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  // Handle token refresh if 401
  if (response.status === 401) {
    const newToken = await refreshAccessTokenAsync()
    if (newToken) {
      // Retry with new token
      headers.Authorization = `Bearer ${newToken}`
      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!retryResponse.ok) {
        // Try to parse error response for typed errors
        try {
          const errorBody = await retryResponse.json()
          if (errorBody._tag) {
            throw new UploadError(
              pipe(
                Option.fromNullable(errorBody.message as string | undefined),
                Option.getOrElse(() => 'Request failed')
              ),
              errorBody as ApiFailure
            )
          }
        } catch (parseError) {
          if (parseError instanceof UploadError) throw parseError
        }
        throw new UploadError(`Upload failed: ${retryResponse.status}`)
      }
      return retryResponse.json()
    }
    throw new UploadError('Authentication failed')
  }

  if (!response.ok) {
    // Try to parse error response for typed errors like LimitExceededError
    try {
      const errorBody = await response.json()
      if (errorBody._tag) {
        throw new UploadError(
          pipe(
            Option.fromNullable(errorBody.message as string | undefined),
            Option.getOrElse(() => 'Request failed')
          ),
          errorBody as ApiFailure
        )
      }
    } catch (parseError) {
      // If parsing fails, throw generic error
      if (parseError instanceof UploadError) throw parseError
    }
    throw new UploadError(`Upload failed: ${response.status}`)
  }

  // Check if response has content
  const contentType = response.headers.get('content-type')
  if (
    contentType !== null &&
    pipe(contentType, Str.includes('application/json'))
  ) {
    return response.json()
  }

  // For streaming responses or text, return the text
  const text = await response.text()
  return text as T
}

/**
 * Helper to create a file object from an expo-image-picker URI
 */
export function createFileFromUri(
  uri: string,
  options?: { name?: string; type?: string }
): UploadFile {
  return {
    uri,
    name: pipe(
      Option.fromNullable(options?.name),
      Option.getOrElse(() => 'photo.jpg')
    ),
    type: pipe(
      Option.fromNullable(options?.type),
      Option.getOrElse(() => 'image/jpeg')
    ),
  }
}
