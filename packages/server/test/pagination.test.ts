import { describe, it, expect } from 'vitest';
import { parsePageParams } from '../src/lib/pagination';

describe('parsePageParams', () => {
  it('should return defaults when no params given', () => {
    const result = parsePageParams({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('should parse custom page and pageSize', () => {
    const result = parsePageParams({ page: '3', pageSize: '15' });
    expect(result).toEqual({ page: 3, pageSize: 15 });
  });

  it('should clamp page to minimum of 1', () => {
    const result = parsePageParams({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('should clamp pageSize to maximum of 100', () => {
    const result = parsePageParams({ pageSize: '999' });
    expect(result.pageSize).toBe(100);
  });

  it('should clamp pageSize to minimum of 1', () => {
    const result = parsePageParams({ pageSize: '0' });
    expect(result.pageSize).toBe(1);
  });

  it('should accept custom default size', () => {
    const result = parsePageParams({}, 50);
    expect(result.pageSize).toBe(50);
  });
});
