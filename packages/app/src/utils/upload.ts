import * as SecureStore from 'expo-secure-store'

const API_BASE_URL = 'http://192.168.1.85:3000'
const ACCESS_TOKEN_KEY = 'lily_access_token'
const REFRESH_TOKEN_KEY = 'lily_refresh_token'

// biome-ignore lint/suspicious/noExplicitAny: FormData requires any for React Native file objects
type FileObject = any

interface UploadFile {
  uri: string
  name: string
  type: string
}

/**
 * Attempt to refresh the access token using the stored refresh token
 */
const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    if (!refreshToken) {
      return null
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      // Refresh failed, clear tokens
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
      return null
    }

    const data = await response.json()
    const newAccessToken = data.accessToken

    // Store the new access token
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken)

    return newAccessToken
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
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

  files.forEach((file) => {
    const fileObject: FileObject = {
      uri: file.uri,
      type: file.type,
      name: file.name,
    }
    formData.append(fieldName, fileObject)
  })

  if (additionalFields) {
    Object.entries(additionalFields).forEach(([key, value]) => {
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
    const newToken = await refreshAccessToken()
    if (newToken) {
      // Retry with new token
      headers.Authorization = `Bearer ${newToken}`
      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!retryResponse.ok) {
        throw new Error(`Upload failed: ${retryResponse.status}`)
      }
      return retryResponse.json()
    }
    throw new Error('Authentication failed')
  }

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`)
  }

  // Check if response has content
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
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
    name: options?.name ?? 'photo.jpg',
    type: options?.type ?? 'image/jpeg',
  }
}
