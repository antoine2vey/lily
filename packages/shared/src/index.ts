// Shared utilities and types for the Lily monorepo

export interface User {
  id: string
  name: string
  email: string
}

export interface Plant {
  id: string
  name: string
  species: string
  userId: string
}

export const VERSION = '1.0.0'
