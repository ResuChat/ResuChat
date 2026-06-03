import { describe, it, expect } from 'vitest';
import { verifyToken, inMemoryTokens } from '../src/auth/token';

describe('verifyToken', () => {
  it('should return null for empty token', async () => {
    const result = await verifyToken('');
    expect(result).toBeNull();
  });

  it('should return null for undefined token', async () => {
    const result = await verifyToken(undefined as any);
    expect(result).toBeNull();
  });

  it('should return username for valid token in memory', async () => {
    const token = 'test_token_' + Date.now();
    inMemoryTokens[token] = { username: 'testuser', expires: Date.now() + 86400000 };
    
    const result = await verifyToken(token);
    expect(result).toBe('testuser');
  });

  it('should return null for expired token', async () => {
    const token = 'expired_token';
    inMemoryTokens[token] = { username: 'testuser', expires: Date.now() - 1000 };
    
    const result = await verifyToken(token);
    expect(result).toBeNull();
  });
});