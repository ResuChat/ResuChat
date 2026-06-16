/** 统一错误模型 */

export class AppError extends Error {
  readonly statusCode: number
  readonly expose: boolean

  constructor(message: string, statusCode: number, options?: { expose?: boolean }) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.expose = options?.expose ?? statusCode < 500
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409)
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super(message, 413)
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string) {
    super(message, 502)
  }
}
