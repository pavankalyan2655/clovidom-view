import { Capacitor } from '@capacitor/core'

export type AuthMode = 'login' | 'signup'

export interface AuthPayload {
  fullName?: string
  email: string
  password: string
}

interface AuthResponse {
  accessToken?: string
  token?: string
  jwt?: string
  message?: string
  data?: AuthResponse
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
  if (typeof value.accessToken === 'string') return value.accessToken
  if (typeof value.token === 'string') return value.token
  if (typeof value.jwt === 'string') return value.jwt
  return tokenFrom(value.data)
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

async function request(path: string, init: RequestInit = {}) {
  validateNativeApiUrl()
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
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
  return request(`/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getProtectedResource(path: '/api/welcome' | '/api/user/profile', token: string) {
  const { data } = await request(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}
