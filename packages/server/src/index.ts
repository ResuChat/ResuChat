import express, { Express, Request, Response, Router } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import routeConfig from './routes'
import { closeDatabase } from './storage/database'
import { tokenCleanupInterval } from './auth/token'
import { captchaCleanupInterval } from './auth/captcha'

dotenv.config()

// 强制 stdout 无缓冲（Windows 上 console.log 输出不刷新的问题）
if (process.stdout.isTTY) {
  ;(process.stdout as any)._handle?.setBlocking(true)
}

const app: Express = express()
const port = process.env.PORT || 3000

const upload = multer({ storage: multer.memoryStorage() })

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173']

app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
      console.warn(`[CORS] Blocked origin: ${origin}`)
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'token',
      'Token',
      'X-Phone',
      'X-Requested-With'
    ],
    credentials: true
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 生产环境建议移除或限制此静态文件服务，结合路径遍历漏洞可导致攻击
// app.use("/files", express.static(path.join(process.cwd(), "temp")));

app.use((req: Request, res: Response, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    )
  })
  next()
})

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AI Agent BFF Layer Running' })
})

type RouteItem = {
  group?: string
  name?: string
  path?: string
  handler?: Router
  children?: RouteItem[]
}

function registerRoutes(routes: RouteItem[], basePath: string = '') {
  for (const route of routes) {
    const currentPath = route.group ? `${basePath}/${route.group}` : basePath

    if (route.handler && route.name) {
      app.use(`${currentPath}/${route.name}`, route.handler)
    } else if (route.children) {
      registerRoutes(route.children, currentPath)
    }
  }
}

registerRoutes(routeConfig)

// 全局错误处理中间件
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

console.log('Routes registered, about to listen...')

async function start() {
  const server = app.listen(Number(port), '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${port}`)
  })

  function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)
    clearInterval(tokenCleanupInterval)
    clearInterval(captchaCleanupInterval)
    closeDatabase()
    server.close(() => {
      console.log('HTTP server closed')
      process.exit(0)
    })
    setTimeout(() => {
      console.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10000).unref()
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}
start().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})

export default app
