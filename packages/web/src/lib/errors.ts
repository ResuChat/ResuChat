export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback
  const response = error.response as { data?: { error?: unknown; message?: unknown } } | undefined
  if (typeof response?.data?.error === 'string') return response.data.error
  if (typeof response?.data?.message === 'string') return response.data.message
  return fallback
}
