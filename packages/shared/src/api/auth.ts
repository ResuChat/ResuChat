export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface RegisterResponse {
  message: string
  data: AuthTokens & {
    userId: string
  }
}

export interface LoginResponse {
  message: string
  data: AuthTokens & {
    userId: string
    username: string
  }
}

export interface AuthActionResponse {
  message: string
}

export interface EmailCodeResponse {
  message: string
  data: {
    key: string
  }
}

export interface RegisterData extends AuthTokens {
  userId: string
}

export interface LoginData extends AuthTokens {
  userId: string
  username: string
}

export type RefreshResponse = AuthTokens
