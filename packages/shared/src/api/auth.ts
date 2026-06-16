export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface RegisterResponse extends AuthTokens {
  message: string
  userId: string
}

export interface LoginResponse extends AuthTokens {
  message: string
  userId: string
  username: string
}

export type RefreshResponse = AuthTokens
