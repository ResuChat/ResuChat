import axios, { AxiosHeaders } from 'axios'
import { attachAuthHeaders, clearAuth, getRefreshToken, saveAuth } from '@/lib/auth'
import type { RefreshResponse } from '@/types/api'

const service = axios.create({
  baseURL: '/api',
  timeout: 60000
})

service.interceptors.request.use(
  (config) => {
    const headers = AxiosHeaders.from(config.headers)
    attachAuthHeaders(headers)
    config.headers = headers
    return config
  },
  (error) => Promise.reject(error)
)

let isRefreshing = false
let refreshQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

async function tryRefreshToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No refresh token')
  const res = await axios.post<RefreshResponse>('/api/auth/refresh', { refreshToken })
  const { accessToken, refreshToken: newRefresh } = res.data
  saveAuth(accessToken, newRefresh)
  return accessToken
}

service.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then((token) => {
          const headers = AxiosHeaders.from(error.config.headers)
          headers.set('Authorization', `Bearer ${token}`)
          error.config.headers = headers
          error.config._retry = true
          return service(error.config)
        })
      }

      isRefreshing = true
      try {
        const newToken = await tryRefreshToken()
        refreshQueue.forEach((q) => q.resolve(newToken))
        refreshQueue = []
        const headers = AxiosHeaders.from(error.config.headers)
        headers.set('Authorization', `Bearer ${newToken}`)
        error.config.headers = headers
        error.config._retry = true
        return service(error.config)
      } catch {
        refreshQueue.forEach((q) => q.reject(new Error('Refresh failed')))
        refreshQueue = []
        clearAuth()
        window.location.href = '/'
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export { service as api }
