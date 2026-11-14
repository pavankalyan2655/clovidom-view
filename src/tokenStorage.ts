import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const authTokenKey = 'authToken'
const nativeStoragePrefix = 'account-access_'

async function withNativeStorage<T>(operation: () => Promise<T>) {
  await SecureStorage.setKeyPrefix(nativeStoragePrefix)
  return operation()
}

export async function readAuthToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return localStorage.getItem(authTokenKey)

  const token = await withNativeStorage(() => SecureStorage.get(authTokenKey))
  return typeof token === 'string' ? token : null
}

export async function saveAuthToken(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(authTokenKey, token)
    return
  }

  await withNativeStorage(() => SecureStorage.set(authTokenKey, token))
}

export async function removeAuthToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(authTokenKey)
    return
  }

  await withNativeStorage(() => SecureStorage.remove(authTokenKey))
}
