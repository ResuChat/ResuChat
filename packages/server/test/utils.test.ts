import { describe, it, expect } from 'vitest';
import {
  decodeFilename,
  mergeOverlappingChunks,
  validateURL,
  refCategoryLabel,
} from '../src/routes/rag/utils';

describe('decodeFilename', () => {
  it('should decode latin1-encoded Chinese filename', () => {
    const encoded = Buffer.from('简历.pdf', 'utf8').toString('latin1');
    expect(decodeFilename(encoded)).toBe('简历.pdf');
  });

  it('should passthrough ASCII filename unchanged', () => {
    expect(decodeFilename('resume.pdf')).toBe('resume.pdf');
  });
});

describe('mergeOverlappingChunks', () => {
  it('should return empty string for empty array', () => {
    expect(mergeOverlappingChunks([])).toBe('');
  });

  it('should return single chunk content as-is', () => {
    expect(mergeOverlappingChunks([{ pageContent: 'hello world' }])).toBe('hello world');
  });

  it('should merge overlapping chunks', () => {
    const chunks = [
      { pageContent: 'hello world foo' },
      { pageContent: 'world foo bar' },
    ];
    expect(mergeOverlappingChunks(chunks)).toBe('hello world foo bar');
  });

  it('should join non-overlapping chunks with newline', () => {
    const chunks = [
      { pageContent: 'hello' },
      { pageContent: 'world' },
    ];
    expect(mergeOverlappingChunks(chunks)).toBe('hello\n\nworld');
  });
});

describe('validateURL', () => {
  it('should accept valid https URL', () => {
    expect(validateURL('https://example.com')).toEqual({ valid: true });
  });

  it('should accept valid http URL', () => {
    expect(validateURL('http://example.com')).toEqual({ valid: true });
  });

  it('should reject invalid protocol', () => {
    const result = validateURL('ftp://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('protocol');
  });

  it('should reject localhost hostname', () => {
    const result = validateURL('http://localhost:3000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Localhost');
  });

  it('should reject localhost IP', () => {
    const result = validateURL('http://127.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Localhost');
  });

  it('should reject private 10.x.x.x IP', () => {
    const result = validateURL('http://10.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('should reject private 192.168.x.x IP', () => {
    const result = validateURL('http://192.168.1.1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('should reject badly formatted URL', () => {
    const result = validateURL('not a url');
    expect(result.valid).toBe(false);
  });
});

describe('refCategoryLabel', () => {
  it('should return 优秀简历 for excellent_resume', () => {
    expect(refCategoryLabel('excellent_resume')).toBe('优秀简历');
  });

  it('should return 参考资料 for reference_doc', () => {
    expect(refCategoryLabel('reference_doc')).toBe('参考资料');
  });

  it('should return 参考资料 for null', () => {
    expect(refCategoryLabel(null)).toBe('参考资料');
  });
});
