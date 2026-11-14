import { Capacitor } from '@capacitor/core'

export type AuthMode = 'login' | 'signup'

export interface AuthPayload {
  fullName?: string
  phone?: string
  email: string
  password: string
}

interface AuthResponse {
  accessToken?: string
  authToken?: string
  token?: string
  jwt?: string
  message?: string
  user?: AuthUser
  data?: unknown
}

export interface AuthUser {
  id?: string
  fullName?: string
  email?: string
  role?: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

function validateNativeApiUrl() {
  if (!Capacitor.isNativePlatform() || import.meta.env.DEV) return

  const url = new URL(apiBaseUrl)
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    throw new Error('Set VITE_API_BASE_URL to your publicly reachable HTTPS backend before releasing the mobile app.')
  }
}

function isAuthResponse(value: unknown): value is AuthResponse {
  return typeof value === 'object' && value !== null
}

function tokenFrom(value: unknown): string | undefined {
  if (!isAuthResponse(value)) return undefined

  const directToken = [
    value.authToken,
    value.accessToken,
    value.token,
    value.jwt,
  ].find((candidate): candidate is string => typeof candidate === 'string')

  if (directToken) return directToken

  if (value.data === undefined || value.data === null) return undefined
  return tokenFrom(value.data)
}

function userFrom(value: unknown): AuthUser | undefined {
  if (!isAuthResponse(value)) return undefined
  if (typeof value.user === 'object' && value.user !== null) return value.user
  return value.data === undefined || value.data === null ? undefined : userFrom(value.data)
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

export async function apiRequest(path: string, init: RequestInit = {}, token?: string) {
  validateNativeApiUrl()
  let response: Response
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  const data = await responseBody(response)
  if (!response.ok) {
    const message = isAuthResponse(data) && typeof data.message === 'string'
      ? data.message
      : 'Your request could not be completed. Please try again.'
    throw new Error(message)
  }

  return { data, token: tokenFrom(data) }
}

export async function authenticate(mode: AuthMode, payload: AuthPayload) {
  const result = await apiRequest(`/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { ...result, user: userFrom(result.data) }
}

export async function getProtectedResource(path: '/api/welcome' | '/api/user/profile', token: string) {
  const { data } = await apiRequest(path, {
    method: 'GET',
  }, token)
  return data
}
