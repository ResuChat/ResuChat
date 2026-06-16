import type { AuthGuard } from '../middleware/authGuard'

export function andGuards(...guards: AuthGuard[]): AuthGuard {
  return async (req) => {
    for (const guard of guards) {
      if (!(await guard(req))) return false
    }
    return true
  }
}

export function orGuards(...guards: AuthGuard[]): AuthGuard {
  return async (req) => {
    for (const guard of guards) {
      if (await guard(req)) return true
    }
    return false
  }
}

export function notGuard(guard: AuthGuard): AuthGuard {
  return async (req) => !(await guard(req))
}

export const all = andGuards
export const any = orGuards
export const not = notGuard
