export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug(...args)
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args)
}
