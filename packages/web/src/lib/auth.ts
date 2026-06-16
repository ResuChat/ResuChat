const ACCESS_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const LOGIN_PHONE_KEY = 'login_phone'
type HeaderCarrier = { set(name: string, value: string): unknown }

function dispatchAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth-change'))
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getLoginPhone(): string | null {
  return localStorage.getItem(LOGIN_PHONE_KEY)
}

export function setLoginPhone(phone: string | null | undefined) {
  if (phone) {
    localStorage.setItem(LOGIN_PHONE_KEY, phone)
  } else {
    localStorage.removeItem(LOGIN_PHONE_KEY)
  }
}

export function saveAuth(accessToken: string, refreshToken: string, phone?: string | null) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  setLoginPhone(phone)
  dispatchAuthChange()
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(LOGIN_PHONE_KEY)
  dispatchAuthChange()
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

export function attachAuthHeaders<T extends HeaderCarrier>(headers: T): T {
  const token = getAccessToken()
  const phone = getLoginPhone()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('token', token)
  }
  if (phone) {
    headers.set('X-Phone', phone)
  }

  return headers
}
