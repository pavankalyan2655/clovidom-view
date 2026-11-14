import { apiRequest, type AuthUser } from './auth'

export type PropertyCategory = 'APARTMENT' | 'VILLA' | 'INDEPENDENT_HOUSE' | 'PLOT'

export interface PropertyFilters {
  search: string
  category: string
  location: string
  availability: string
  minPrice: string
  maxPrice: string
  sort: string
}

export interface PropertyPayload {
  title: string
  projectName?: string | null
  builder?: string | null
  category: PropertyCategory
  location?: {
    address?: string | null
    city?: string | null
    state?: string | null
    mapUrl?: string | null
  } | null
  startingPrice?: number | null
  maxPrice?: number | null
  priceUnit?: string | null
  availability?: string | null
  description?: string | null
  amenities?: string[] | null
  details?: Record<string, unknown> | null
  contact?: {
    name?: string | null
    phone?: string | null
    email?: string | null
  } | null
  published: boolean
}

function queryString(filters: PropertyFilters) {
  const params = new URLSearchParams()
  const values: Record<string, string> = {
    search: filters.search,
    category: filters.category,
    location: filters.location,
    availability: filters.availability,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
  }

  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })

  return params.size ? `?${params.toString()}` : ''
}

function jsonRequest(method: 'POST' | 'PUT' | 'PATCH', body: unknown) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } satisfies RequestInit
}

export async function fetchProfile(token: string): Promise<AuthUser> {
  const { data } = await apiRequest('/api/user/profile', { method: 'GET' }, token)
  let current: unknown = data
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) break
    const profile = current as { user?: AuthUser; role?: string; data?: unknown }
    if (profile.user) current = profile.user
    else if (profile.role) {
      if (!profile.role) throw new Error('The profile response is missing the user role.')
      return current as AuthUser
    } else {
      current = profile.data
    }
  }

  throw new Error('The profile response was not a valid user object with a role.')
}

export async function fetchProperties(filters: PropertyFilters, token: string) {
  const { data } = await apiRequest(`/api/properties${queryString(filters)}`, { method: 'GET' }, token)
  return data
}

export async function fetchAdminProperties(token: string) {
  const { data } = await apiRequest('/api/admin/properties', { method: 'GET' }, token)
  return data
}

export async function fetchAdminEnquiries(token: string) {
  const { data } = await apiRequest('/api/admin/enquiries', { method: 'GET' }, token)
  return data
}

export async function fetchProperty(id: string, token: string) {
  const { data } = await apiRequest(`/api/properties/${encodeURIComponent(id)}`, { method: 'GET' }, token)
  return data
}

export async function saveProperty(payload: PropertyPayload, token: string, id?: string) {
  const path = id ? `/api/admin/properties/${encodeURIComponent(id)}` : '/api/admin/properties'
  const { data } = await apiRequest(path, jsonRequest(id ? 'PUT' : 'POST', payload), token)
  return data
}

export async function uploadPropertyImages(id: string, files: FileList | File[], token: string) {
  const body = new FormData()
  Array.from(files).forEach((file) => body.append('files', file))
  const { data } = await apiRequest(`/api/admin/properties/${encodeURIComponent(id)}/images`, {
    method: 'POST',
    body,
  }, token)
  return data
}

export async function setPropertyPublished(id: string, published: boolean, token: string) {
  const { data } = await apiRequest(
    `/api/admin/properties/${encodeURIComponent(id)}/publish`,
    jsonRequest('PATCH', { published }),
    token,
  )
  return data
}

export async function deleteProperty(id: string, token: string) {
  const { data } = await apiRequest(`/api/admin/properties/${encodeURIComponent(id)}`, { method: 'DELETE' }, token)
  return data
}

export async function deletePropertyImage(propertyId: string, imageId: string, token: string) {
  const { data } = await apiRequest(
    `/api/admin/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(imageId)}`,
    { method: 'DELETE' },
    token,
  )
  return data
}

export async function submitEnquiry(payload: {
  propertyId: string
  fullName: string
  email: string
  phone: string
  message: string
}, token: string) {
  const { data } = await apiRequest('/api/enquiries', jsonRequest('POST', payload), token)
  return data
}
