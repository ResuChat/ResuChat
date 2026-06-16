/** 校验 URL 是否合法（只允许 http/https，禁止内网地址） */
export function validateURL(rawUrl: string): { valid: boolean; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http/https protocols allowed' }
  }
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]'
  ) {
    return { valid: false, error: 'Localhost URLs are not allowed' }
  }
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    return { valid: false, error: 'Private IP URLs are not allowed' }
  }
  return { valid: true }
}
