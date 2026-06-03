# JWT 认证迁移方案

## 一、动机

当前使用 UUID token + Redis/内存存储的方式，将迁移到 JWT，同时保留 Redis 用于：

| 能力 | 方式 |
| :--- | :--- |
| 手动失效（登出/撤销） | JWT `jti` 黑名单，存 Redis，TTL 自动过期 |
| 自动续期 | access token（15min）+ refresh token（7天），刷新通过 Redis 校验 |
| 无状态验证 | access token 用 `jwt.verify()` 验证签名，不查 DB |
| 与现有架构一致 | captcha、token 已用 Redis，新增黑名单和 refresh token 沿用同一模式 |

---

## 二、双 Token 流程

```
Login → { access_token(JWT, 15min), refresh_token(UUID, 7天) }
                                          │
           ┌──────────────────────────────┤
           │                              │
     访问 API                        access_token 过期 (401)
           │                              │
 authMiddleware 验证 JWT             axios 拦截器检测 401
 签名 + 黑名单检查                    → /auth/refresh { refreshToken }
           │                         → Redis 验证 refresh token
           │                         → 签发新 access_token
           │                         → 前端重试原请求
           │
    Logout → DEL refresh:{token}
           → SET jti_blacklist:{jti} 1 EX 900
```

---

## 三、Redis 数据结构

| Key | Value | TTL | 用途 |
| :--- | :--- | :--- | :--- |
| `token:{uuid}` | `username` | 86400s | **旧 UUID token（迁移过渡期保留）** |
| `jti_blacklist:{jti}` | `1` | 900s | JWT 黑名单（= access_token 有效期） |
| `refresh:{uuid}` | `{userId}` | 604800s | refresh token（7天） |
| `captcha:{key}` | `text` | 300s | 验证码（已有） |

> TTL 与 JWT 的 `exp` 一致，黑名单条目在 token 过期后自动清除，无需额外清理。

---

## 四、后端改动

### 4.1 `src/auth/token.ts` — 完整重写

```typescript
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { getDatabase } from '../storage/database'

let authRedis: any = null
const inMemoryTokens: Record<string, string> = {}
const inMemoryJtiBlacklist = new Set<string>()

// === Redis 初始化（复用现有 authRedis） ===
const redis = (() => {
  try { return require('./captcha').redis } catch { return null }
})()

function getRedis() {
  if (redis?.status === 'ready') return redis
  return null
}

// === JWT 配置 ===
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.warn('JWT_SECRET not set, using dev default')
}
const DEV_SECRET = 'dev-jwt-secret-do-not-use-in-production'
const SECRET = JWT_SECRET || DEV_SECRET
const ACCESS_TTL = 15 * 60        // 15 分钟
const REFRESH_TTL = 7 * 24 * 3600 // 7 天

/** 签发 access_token (JWT) */
export async function issueAccessToken(username: string, jti: string): Promise<string> {
  return jwt.sign(
    { username, jti, type: 'access' },
    SECRET,
    { expiresIn: ACCESS_TTL }
  )
}

/** 签发 refresh_token (UUID, 存入 Redis) */
export async function issueRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomUUID()
  const r = getRedis()
  if (r) {
    await r.setex(`refresh:${token}`, REFRESH_TTL, String(userId))
  } else {
    inMemoryTokens[`refresh:${token}`] = String(userId)
    setTimeout(() => delete inMemoryTokens[`refresh:${token}`], REFRESH_TTL * 1000)
  }
  return token
}

/** 验证 access_token（签名 + 黑名单） */
export async function verifyAccessToken(token: string): Promise<{ username: string; jti: string } | null> {
  try {
    const decoded = jwt.verify(token, SECRET) as { username: string; jti: string; type: string }
    if (decoded.type !== 'access') return null
    // 黑名单检查
    const r = getRedis()
    if (r) {
      const blacklisted = await r.get(`jti_blacklist:${decoded.jti}`)
      if (blacklisted) return null
    } else if (inMemoryJtiBlacklist.has(decoded.jti)) {
      return null
    }
    return { username: decoded.username, jti: decoded.jti }
  } catch {
    return null
  }
}

/** 验证 refresh_token */
export async function verifyRefreshToken(token: string): Promise<number | null> {
  const r = getRedis()
  if (r) {
    const val = await r.get(`refresh:${token}`)
    return val ? parseInt(val) : null
  }
  const val = inMemoryTokens[`refresh:${token}`]
  return val ? parseInt(val) : null
}

/** 撤销 refresh_token（登出） */
export async function revokeRefreshToken(token: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.del(`refresh:${token}`)
  } else {
    delete inMemoryTokens[`refresh:${token}`]
  }
}

/** 将 access_token 加入黑名单（登出） */
export async function blacklistJwt(jti: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.setex(`jti_blacklist:${jti}`, ACCESS_TTL, '1')
  } else {
    inMemoryJtiBlacklist.add(jti)
    setTimeout(() => inMemoryJtiBlacklist.delete(jti), ACCESS_TTL * 1000)
  }
}

/** Auth 中间件 */
export function createAuthMiddleware() {
  return (req: any, res: any, next: any) => {
    const token = req.headers["token"] || req.headers["Token"]
    if (!token) return res.status(401).json({ error: "Token required" })
    verifyAccessToken(token).then((result) => {
      if (!result) return res.status(401).json({ error: "Invalid or expired token" })
      req.username = result.username
      req.jti = result.jti
      next()
    })
  }
}
```

### 4.2 `src/auth/index.ts` — Login/Logout/Refresh

**Login** 改返回双 token：
```typescript
const jti = crypto.randomUUID()
const accessToken = await issueAccessToken(username, jti)
const refreshToken = await issueRefreshToken(userId)

res.json({ message: "Login successful", access_token: accessToken, refresh_token: refreshToken, username })
```

**新增 `POST /auth/refresh`**：
```typescript
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: "Refresh token required" })
  const userId = await verifyRefreshToken(refreshToken)
  if (!userId) return res.status(401).json({ error: "Invalid or expired refresh token" })

  const user = await getUserById(userId)
  if (!user) return res.status(404).json({ error: "User not found" })

  const username = `user_${user.phone}`
  const jti = crypto.randomUUID()
  const accessToken = await issueAccessToken(username, jti)

  res.json({ access_token: accessToken })
})
```

**Logout** 改为撤销：
```typescript
router.post("/logout", async (req, res) => {
  const token = req.headers["token"] || req.headers["Token"]
  const { refreshToken } = req.body

  // 撤销 access_token（如果请求中有 jti）
  if (req.jti) await blacklistJwt(req.jti)
  // 撤销 refresh_token
  if (refreshToken) await revokeRefreshToken(refreshToken)

  res.json({ message: "Logged out" })
})
```

### 4.3 环境变量

```
JWT_SECRET=your-secret-here        # 必需
ACCESS_TOKEN_TTL=900               # 可选，默认 15min（秒）
REFRESH_TOKEN_TTL=604800           # 可选，默认 7天（秒）
```

---

## 五、前端改动

### 5.1 Token 存储

- `localStorage.auth_token` → 存 **access_token**（JWT，15min 过期）
- `localStorage.refresh_token` → 存 **refresh_token**（UUID，可撤销续期）
- 登录时同时存两个

### 5.2 401 自动续期

axios 响应拦截器增加 refresh 逻辑：

```typescript
let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

service.interceptors.response.use(
  (res) => res.data,
  async (error) => {
    if (error.response?.status !== 401) return Promise.reject(error)

    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      clearAuth()
      return Promise.reject(error)
    }

    if (!isRefreshing) {
      isRefreshing = true
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        })
        const data = await res.json()
        localStorage.setItem('auth_token', data.access_token)
        isRefreshing = false
        // 重试所有等待中的请求
        pendingRequests.forEach(cb => cb(data.access_token))
        pendingRequests = []
        // 重试当前请求
        error.config.headers.set('token', data.access_token)
        return service(error.config)
      } catch {
        isRefreshing = false
        pendingRequests = []
        clearAuth()
        return Promise.reject(error)
      }
    } else {
      // 正在刷新中，排队等待
      return new Promise((resolve) => {
        pendingRequests.push((newToken) => {
          error.config.headers.set('token', newToken)
          resolve(service(error.config))
        })
      })
    }
  }
)

function clearAuth() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('login_phone')
  window.dispatchEvent(new Event('auth-change'))
  import('@/router').then((mod) => mod.default.push('/'))
}
```

### 5.3 其余文件

| 文件 | 改动 |
| :--- | :--- |
| `LoginPage.vue` | 额外存 `refresh_token` |
| `AppHeader.vue` | 注销时发 `refreshToken` 到 body，清 `refresh_token` |
| 其余文件 | 不变 |

---

## 六、迁移步骤

### 准备
```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

### 步骤

1. 在 `.env` 中添加 `JWT_SECRET=...`
2. 重写 `src/auth/token.ts`
3. 更新 `src/auth/index.ts`（login/logout/refresh）
4. 更新前端 axios 拦截器（401 自动 refresh）
5. 更新 `LoginPage.vue` / `AppHeader.vue`
6. 全量测试

> 旧 UUID token 的 `storeToken` / `removeToken` / `inMemoryTokens` / authRedis 可以保留到迁移完成后再清理。

---

## 七、风险与注意

| 风险 | 应对 |
| :--- | :--- |
| `JWT_SECRET` 泄露 | 生产使用强密钥，定期轮换 |
| refresh token 被盗 | TTL 7天，可通过 `/auth/logout` 撤销 |
| 并发 refresh 请求炸裂 | 拦截器用 `isRefreshing` + `pendingRequests` 队列合并，只发一次 |
| Redis 不可用 | 降级到内存（Map + setTimeout），重启后需重新登录 |
| 旧 UUID token 过渡 | 双 token 格式共存期间，中间件需兼容两种格式（先试 JWT，再试 UUID） |
