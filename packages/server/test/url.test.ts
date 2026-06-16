import { describe, expect, it } from 'vitest'
import { validateURL } from '../src/lib/url'

describe('validateURL', () => {
  it('should accept valid https URL', () => {
    expect(validateURL('https://example.com')).toEqual({ valid: true })
  })

  it('should accept valid http URL', () => {
    expect(validateURL('http://example.com')).toEqual({ valid: true })
  })

  it('should reject invalid protocol', () => {
    const result = validateURL('ftp://example.com')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('protocol')
  })

  it('should reject localhost hostname', () => {
    const result = validateURL('http://localhost:3000')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Localhost')
  })

  it('should reject localhost IP', () => {
    const result = validateURL('http://127.0.0.1')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Localhost')
  })

  it('should reject private 10.x.x.x IP', () => {
    const result = validateURL('http://10.0.0.1')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Private')
  })

  it('should reject private 192.168.x.x IP', () => {
    const result = validateURL('http://192.168.1.1')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Private')
  })

  it('should reject badly formatted URL', () => {
    const result = validateURL('not a url')
    expect(result.valid).toBe(false)
  })
})
